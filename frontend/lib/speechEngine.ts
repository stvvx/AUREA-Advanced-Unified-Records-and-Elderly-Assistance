/**
 * frontend/lib/speechEngine.ts
 *
 * LOLO AUREA Speech Engine
 *
 * TTS:
 *   Web    → Flask → ElevenLabs → Base64 MP3 → Browser Audio
 *   Native → Flask → ElevenLabs → Base64 MP3 → Expo Audio
 *
 * STT:
 *   Native → expo-av → Flask/Gemini STT
 *   Web    → Browser SpeechRecognition
 *
 * Lip Sync:
 *   Word-timing-based viseme animation, synced to the real audio
 *   playback position (no backend changes required). We don't have
 *   true amplitude/phoneme data, so instead we:
 *     1. Split the spoken text into words.
 *     2. Estimate each word's "weight" (syllable count) and spread
 *        the words across the real audio duration proportionally.
 *     3. Every tick, find which word the actual playback position
 *        currently falls into, and emit a mouth-open pulse per
 *        syllable within that word (with closed-mouth treatment for
 *        words starting m/b/p).
 *   This is an approximation, not true phoneme-accurate lip sync,
 *   but it tracks the real timing/pacing of the audio instead of
 *   being a fixed, disconnected animation.
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import {
  AudioModule,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  type AudioPlayer,
  type AudioRecorder,
  type AudioStatus,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import {
  API_BASE_URL,
  sendLoloAudioSTT,
} from '../services/loloApi';

export type VisemeCallback = (
  amplitude: number,
  phoneme: string
) => void;

export interface SpeechOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  voiceIdentifier?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

// ===========================================================================
// WORD-TIMING SCHEDULE TYPES
// ===========================================================================

type WordScheduleItem = {
  startSec: number;
  endSec: number;
  text: string;
  syllables: number;
  closedStart: boolean;
};

class SpeechEngine {
  private isWeb = Platform.OS === 'web';

  // Browser STT only
  private recognition: any = null;

  // State
  private isSpeakingActive = false;
  private isListeningActive = false;

  // Visemes
  private visemeListeners: Set<VisemeCallback> = new Set();
  private visemeTimer: any = null;

  // Word-timing lip sync state
  private lastPositionSec = 0;
  private lastDurationSec = 0;
  private wordSchedule: WordScheduleItem[] = [];
  private currentSpeechText = '';

  // Native ElevenLabs audio
  private currentSound: AudioPlayer | null = null;

  // Web ElevenLabs audio
  private currentWebAudio: any = null;
  private currentWebAudioUrl: string | null = null;

  // Prevent old TTS requests from playing
  private speechRequestId = 0;

  // Native recording
  private nativeRecording: AudioRecorder | null = null;

  private nativeRecordingCallback:
    ((text: string, isFinal: boolean) => void) | null = null;

  private nativeErrorCallback:
    ((error: any) => void) | null = null;

  private nativeEndCallback:
    (() => void) | null = null;

  constructor() {
    void this.initEngine();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  private async initEngine(): Promise<void> {
    /*
     * IMPORTANT:
     * Do NOT call expo-speech on Web.
     *
     * ElevenLabs handles TTS.
     * Browser SpeechRecognition is only for STT.
     */

    if (this.isWeb) {
      if (typeof window === 'undefined') {
        return;
      }

      this.initWebRecognition();
      return;
    }

    // -------------------------------------------------------------------------
    // NATIVE
    // -------------------------------------------------------------------------

    /*
     * We don't need native voice discovery for ElevenLabs TTS.
     *
     * Keep expo-speech imported because the project may still use it elsewhere,
     * but DO NOT call getAvailableVoicesAsync().
     */

    console.log('[LOLO SPEECH] Native speech engine initialized.');
  }

  private initWebRecognition(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.warn(
          '[LOLO STT] Browser SpeechRecognition is not available.'
        );
        this.recognition = null;
        return;
      }

      this.recognition = new SpeechRecognition();

      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'fil-PH';

      console.log('[LOLO STT] Browser SpeechRecognition initialized.');
    } catch (error) {
      console.error(
        '[LOLO STT] Failed to initialize browser recognition:',
        error
      );

      this.recognition = null;
    }
  }

  // ===========================================================================
  // VISEME / LIP SYNC
  // ===========================================================================

  public registerVisemeListener(
    cb: VisemeCallback
  ): () => void {
    this.visemeListeners.add(cb);

    return () => {
      this.visemeListeners.delete(cb);
    };
  }

  private emitViseme(
    amplitude: number,
    phoneme: string = 'A'
  ): void {
    this.visemeListeners.forEach((cb) => {
      try {
        cb(amplitude, phoneme);
      } catch {}
    });
  }

  // ---------------------------------------------------------------------------
  // WORD SCHEDULE BUILDER
  //
  // Spreads the spoken text's words across the real audio duration,
  // weighted by an estimated syllable count per word. Words that end
  // in punctuation (. , ! ? ; :) reserve a small shared pause budget
  // so the mouth actually closes on natural breaks instead of
  // chattering nonstop through the whole clip.
  // ---------------------------------------------------------------------------

  private buildWordSchedule(
    text: string,
    durationSec: number
  ): void {
    const raw = (text || '').trim();

    if (!raw || durationSec <= 0) {
      this.wordSchedule = [];
      return;
    }

    const tokens = raw.split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      this.wordSchedule = [];
      return;
    }

    const vowelPattern = /[aeiouAEIOU]/g;

    const items = tokens.map((token) => {
      const clean = token.replace(
        /[^\p{L}\p{N}]/gu,
        ''
      );

      const vowelMatches = clean.match(vowelPattern);

      const syllables = Math.max(
        1,
        vowelMatches
          ? vowelMatches.length
          : Math.ceil(clean.length / 3)
      );

      const endsWithPause = /[.,!?;:]$/.test(token);
      const closedStart = /^[mbp]/i.test(clean);

      // Weight each word's share of the speaking budget by its
      // syllable count, with a floor so even one-syllable words
      // still get visible airtime.
      const weight = Math.max(1, syllables);

      return {
        clean,
        syllables,
        endsWithPause,
        closedStart,
        weight,
      };
    });

    const totalWeight =
      items.reduce((sum, i) => sum + i.weight, 0) || 1;

    // Reserve a modest pause budget for punctuation breaks, capped
    // so it can never eat more than a quarter of the clip.
    const pauseCount = items.filter(
      (i) => i.endsWithPause
    ).length;

    const pauseBudget = Math.min(
      durationSec * 0.25,
      pauseCount * 0.18
    );

    const speakingBudget = Math.max(
      0.1,
      durationSec - pauseBudget
    );

    const perPause =
      pauseCount > 0
        ? pauseBudget / pauseCount
        : 0;

    let cursor = 0;

    const schedule: WordScheduleItem[] = [];

    items.forEach((item) => {
      const wordDuration =
        (item.weight / totalWeight) *
        speakingBudget;

      const start = cursor;
      const end = start + wordDuration;

      schedule.push({
        startSec: start,
        endSec: end,
        text: item.clean,
        syllables: item.syllables,
        closedStart: item.closedStart,
      });

      cursor =
        end +
        (item.endsWithPause ? perPause : 0);
    });

    this.wordSchedule = schedule;
  }

  // ---------------------------------------------------------------------------
  // Given the current playback position, find which scheduled word
  // it falls in and produce a mouth-open pulse for that word's
  // current syllable.
  // ---------------------------------------------------------------------------

  private computeVisemeFromSchedule(
    positionSec: number
  ): { amplitude: number; phoneme: string } {
    if (!this.wordSchedule.length) {
      return { amplitude: 0, phoneme: 'neutral' };
    }

    const word = this.wordSchedule.find(
      (w) =>
        positionSec >= w.startSec &&
        positionSec <= w.endSec
    );

    if (!word) {
      // We're in a pause between words.
      return { amplitude: 0.05, phoneme: 'M' };
    }

    const span = Math.max(
      0.001,
      word.endSec - word.startSec
    );

    const localT = Math.min(
      1,
      Math.max(0, (positionSec - word.startSec) / span)
    );

    // Simulate one open/close pulse per syllable across the word.
    const pulsePosition = localT * word.syllables;
    const pulseFrac =
      pulsePosition - Math.floor(pulsePosition);

    const bump = Math.sin(pulseFrac * Math.PI);

    let amplitude = 0.15 + bump * 0.65;

    // Closed-mouth consonants (m/b/p) at the start of a word keep
    // the mouth mostly shut for the first part of that word.
    if (word.closedStart && localT < 0.25) {
      amplitude *= 0.25;
    }

    amplitude = Math.max(0.05, Math.min(1, amplitude));

    const phoneme =
      word.closedStart && localT < 0.25 ? 'M' : 'A';

    return { amplitude, phoneme };
  }

  // ---------------------------------------------------------------------------
  // Starts the lip-sync tick loop for a given spoken text. Reads the
  // real playback position (updated elsewhere via playbackStatusUpdate
  // on native / timeupdate on web) and drives the mouth from the word
  // schedule once the real audio duration is known. Before duration is
  // known, uses a brief soft idle motion so the mouth isn't frozen.
  // ---------------------------------------------------------------------------

  private startVisemeAnimation(text: string): void {
    this.stopVisemeAnimation();

    this.currentSpeechText = text;
    this.wordSchedule = [];
    this.lastPositionSec = 0;
    // NOTE: do not reset lastDurationSec here — on some platforms
    // duration is known slightly before play() resolves, and we
    // don't want to throw that away.

    const startedAt = Date.now();

    this.visemeTimer = setInterval(() => {
      if (
        !this.wordSchedule.length &&
        this.lastDurationSec > 0.1
      ) {
        this.buildWordSchedule(
          this.currentSpeechText,
          this.lastDurationSec
        );
      }

      if (!this.wordSchedule.length) {
        // Duration not known yet — gentle idle motion so the mouth
        // isn't frozen while we wait for the first status update.
        const t = (Date.now() - startedAt) / 1000;

        const amplitude =
          0.15 +
          ((Math.sin(t * 6) + 1) / 2) * 0.25;

        this.emitViseme(amplitude, 'A');
        return;
      }

      const { amplitude, phoneme } =
        this.computeVisemeFromSchedule(
          this.lastPositionSec
        );

      this.emitViseme(amplitude, phoneme);
    }, 40);
  }

  private stopVisemeAnimation(): void {
    if (this.visemeTimer) {
      clearInterval(this.visemeTimer);
      this.visemeTimer = null;
    }

    this.wordSchedule = [];
    this.currentSpeechText = '';
    this.lastPositionSec = 0;
    this.lastDurationSec = 0;

    this.emitViseme(
      0,
      'neutral'
    );
  }

  // ===========================================================================
  // TEXT TO SPEECH
  // ===========================================================================

  public speak(
    text: string,
    onStart?: () => void,
    onEnd?: () => void,
    options?: SpeechOptions
  ): void {
    const cleanText = text
      .replace(/\[ACTION:[A-Z_]+\]/g, '')
      .trim();

    if (!cleanText) {
      onEnd?.();
      return;
    }

    console.log(
      '[LOLO TTS] Speaking:',
      cleanText
    );

    // Stop previous audio
    this.stop();

    this.isSpeakingActive = true;

    const rate =
      options?.rate ?? 0.92;

    const language =
      options?.language ?? 'fil-PH';

    const pitch =
      options?.pitch ?? 0.95;

    void this.playElevenLabsAudio(
      cleanText,
      rate,
      pitch,
      language,
      onStart,
      onEnd,
      options?.onError
    );
  }

  public speakInstant(
    text: string,
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    if (!text.trim()) return;

    void Speech.stop();
    Speech.speak(text, {
      language: 'fil-PH',
      rate: 0.96,
      pitch: 0.95,
      onStart,
      onDone: onEnd,
      onStopped: onEnd,
      onError: onEnd,
    });
  }

  // ===========================================================================
  // ELEVENLABS PLAYBACK
  // ===========================================================================

  private async playElevenLabsAudio(
    text: string,
    rate: number,
    pitch: number,
    language: string,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    const requestId =
      ++this.speechRequestId;

    let fileUri: string | null = null;

    try {
      console.log(
        '[LOLO TTS] Requesting ElevenLabs audio...'
      );

      // -----------------------------------------------------------------------
      // BACKEND
      // -----------------------------------------------------------------------

      /*
       * WEB:
       *   Flask is running on this same PC.
       *
       * NATIVE:
       *   Phone needs the PC's LAN IP.
       */

      const backendUrl =
        this.isWeb
          ? 'http://127.0.0.1:5000'
          : API_BASE_URL;

      console.log(
        '[LOLO TTS] Backend:',
        backendUrl
      );

      const response = await fetch(
        `${backendUrl}/api/lolo/speech/tts`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            text,

            language:
              language || 'fil',

            speechRate:
              rate,

            speechPitch:
              pitch,
          }),
        }
      );

      console.log(
        '[LOLO TTS] Flask status:',
        response.status
      );

      let result: any;

      try {
        result =
          await response.json();
      } catch {
        throw new Error(
          'Flask returned invalid JSON.'
        );
      }

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            `TTS request failed: ${response.status}`
        );
      }

      if (
        !result.audioBase64 ||
        typeof result.audioBase64 !==
          'string'
      ) {
        throw new Error(
          'ElevenLabs returned no audio.'
        );
      }

      console.log(
        '[LOLO TTS] Audio received.',
        'Base64 length:',
        result.audioBase64.length,
        'Voice:',
        result.voiceId
      );

      // -----------------------------------------------------------------------
      // CANCEL CHECK
      // -----------------------------------------------------------------------

      if (
        requestId !==
        this.speechRequestId
      ) {
        console.log(
          '[LOLO TTS] Request cancelled before playback.'
        );

        return;
      }

      // =========================================================================
      // WEB PLAYBACK
      // =========================================================================

      if (this.isWeb) {
        await this.playWebAudio(
          result.audioBase64,
          text,
          requestId,
          onStart,
          onEnd
        );

        return;
      }

      // =========================================================================
      // NATIVE PLAYBACK
      // =========================================================================

      const cacheDirectory =
        FileSystem.cacheDirectory;

      if (!cacheDirectory) {
        throw new Error(
          'Expo cache directory is unavailable.'
        );
      }

      fileUri =
        `${cacheDirectory}lolo_${Date.now()}.mp3`;

      console.log(
        '[LOLO TTS] Writing MP3:',
        fileUri
      );

      await FileSystem.writeAsStringAsync(
        fileUri,
        result.audioBase64,
        {
          encoding:
            FileSystem.EncodingType.Base64,
        }
      );

      if (
        requestId !==
        this.speechRequestId
      ) {
        try {
          await FileSystem.deleteAsync(
            fileUri,
            {
              idempotent: true,
            }
          );
        } catch {}

        return;
      }

      console.log(
        '[LOLO TTS] MP3 written successfully.'
      );

      // -----------------------------------------------------------------------
      // NATIVE AUDIO MODE
      // -----------------------------------------------------------------------

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });

      // -----------------------------------------------------------------------
// CREATE SOUND
// -----------------------------------------------------------------------

console.log('[LOLO TTS] Loading MP3...');

const fileInfo = await FileSystem.getInfoAsync(fileUri);

console.log(
  '[LOLO TTS] File check:',
  fileUri,
  fileInfo
);

if (!fileInfo.exists) {
  throw new Error(
    `[LOLO TTS] MP3 file does not exist: ${fileUri}`
  );
}

const sound = createAudioPlayer({
  uri: fileUri,
});

if (!sound.isLoaded) {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      subscription.remove();

      reject(
        new Error(
          'Expo Audio failed to load MP3.'
        )
      );
    }, 10000);

    const subscription = sound.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        if (!status.isLoaded || settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        subscription.remove();

        resolve();
      }
    );
  });
}

      sound.volume = 1.0;
      sound.setPlaybackRate(1.0);

      this.currentSound =
        sound;

      // -----------------------------------------------------------------------
      // LIP-SYNC POSITION TRACKING
      //
      // Keeps lastPositionSec / lastDurationSec up to date from the
      // real player status, independent of the finish-detection
      // listener below, so the word-timing tick loop always has an
      // accurate read on where playback actually is.
      // -----------------------------------------------------------------------

      sound.addListener(
        'playbackStatusUpdate',
        (status: AudioStatus) => {
          if (!status.isLoaded) {
            return;
          }

          if (typeof (status as any).currentTime === 'number') {
            this.lastPositionSec = (status as any).currentTime;
          }

          if (
            typeof (status as any).duration === 'number' &&
            (status as any).duration > 0
          ) {
            this.lastDurationSec = (status as any).duration;
          }
        }
      );

      // -----------------------------------------------------------------------
      // PLAYBACK CALLBACK
      // -----------------------------------------------------------------------

      sound.addListener(
        'playbackStatusUpdate',
        (playbackStatus: AudioStatus) => {
          if (!playbackStatus.isLoaded) {
  console.error(
    '[LOLO TTS] Playback error: Audio is not loaded.'
  );

  return;
}

          if (
            playbackStatus.didJustFinish
          ) {
            console.log(
              '[LOLO TTS] Audio finished.'
            );

            this.isSpeakingActive =
              false;

            this.stopVisemeAnimation();

            if (
              this.currentSound ===
              sound
            ) {
              this.currentSound =
                null;
            }

            sound.remove();

            if (fileUri) {
              void FileSystem
                .deleteAsync(
                  fileUri,
                  {
                    idempotent: true,
                  }
                )
                .catch(() => {});
            }

            onEnd?.();
          }
        }
      );

      // -----------------------------------------------------------------------
      // START NATIVE AUDIO
      // -----------------------------------------------------------------------

      if (
        requestId !==
        this.speechRequestId
      ) {
        try {
          sound.remove();
        } catch {}

        return;
      }

      console.log(
        '[LOLO TTS] STARTING NATIVE AUDIO'
      );

      onStart?.();

      this.startVisemeAnimation(text);

      sound.play();

      console.log(
        '[LOLO TTS] NATIVE AUDIO PLAYING'
      );
    } catch (error: any) {
      console.error(
        '[LOLO TTS] ERROR:',
        error
      );

      this.isSpeakingActive =
        false;

      this.stopVisemeAnimation();

      if (this.currentSound) {
        const sound =
          this.currentSound;

        this.currentSound =
          null;

        try {
          sound.pause();
        } catch {}

        try {
          sound.remove();
        } catch {}
      }

      if (fileUri) {
        try {
          await FileSystem.deleteAsync(
            fileUri,
            {
              idempotent: true,
            }
          );
        } catch {}
      }

      onError?.(error);
      onEnd?.();
    }
  }

  // ===========================================================================
  // WEB AUDIO
  // ===========================================================================

  private async playWebAudio(
    audioBase64: string,
    text: string,
    requestId: number,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    if (
      typeof window ===
      'undefined'
    ) {
      throw new Error(
        'Browser window is unavailable.'
      );
    }

    console.log(
      '[LOLO TTS] Preparing browser audio...'
    );

    // Stop previous browser audio
    this.stopWebAudio();

    /*
     * Convert Base64 → binary → Blob.
     *
     * Blob URL is more reliable than putting
     * a large Base64 string directly in src.
     */

    const binaryString =
      window.atob(audioBase64);

    const len =
      binaryString.length;

    const bytes =
      new Uint8Array(len);

    for (
      let i = 0;
      i < len;
      i++
    ) {
      bytes[i] =
        binaryString.charCodeAt(i);
    }

    const blob =
      new Blob(
        [bytes],
        {
          type: 'audio/mpeg',
        }
      );

    const audioUrl =
      URL.createObjectURL(blob);

    const audio =
      new window.Audio();

    audio.src =
      audioUrl;

    audio.volume =
      1.0;

    this.currentWebAudio =
      audio;

    this.currentWebAudioUrl =
      audioUrl;

    // -----------------------------------------------------------------------
    // LIP-SYNC POSITION TRACKING (WEB)
    // -----------------------------------------------------------------------

    audio.onloadedmetadata = () => {
      this.lastDurationSec = audio.duration || 0;
    };

    audio.ontimeupdate = () => {
      this.lastPositionSec = audio.currentTime || 0;

      if (audio.duration && audio.duration > 0) {
        this.lastDurationSec = audio.duration;
      }
    };

    audio.onplay = () => {
      if (
        requestId !==
        this.speechRequestId
      ) {
        return;
      }

      console.log(
        '[LOLO TTS] BROWSER AUDIO PLAYING'
      );

      this.isSpeakingActive =
        true;

      this.startVisemeAnimation(text);

      onStart?.();
    };

    audio.onended = () => {
      console.log(
        '[LOLO TTS] BROWSER AUDIO FINISHED'
      );

      this.isSpeakingActive =
        false;

      this.stopVisemeAnimation();

      if (
        this.currentWebAudio ===
        audio
      ) {
        this.currentWebAudio =
          null;
      }

      if (
        this.currentWebAudioUrl ===
        audioUrl
      ) {
        this.currentWebAudioUrl =
          null;
      }

      URL.revokeObjectURL(
        audioUrl
      );

      onEnd?.();
    };

    audio.onerror = () => {
      console.error(
        '[LOLO TTS] BROWSER AUDIO ERROR'
      );

      this.isSpeakingActive =
        false;

      this.stopVisemeAnimation();

      if (
        this.currentWebAudio ===
        audio
      ) {
        this.currentWebAudio =
          null;
      }

      if (
        this.currentWebAudioUrl ===
        audioUrl
      ) {
        this.currentWebAudioUrl =
          null;
      }

      URL.revokeObjectURL(
        audioUrl
      );

      onEnd?.();
    };

    console.log(
      '[LOLO TTS] STARTING BROWSER AUDIO'
    );

    try {
      await audio.play();

      console.log(
        '[LOLO TTS] Browser audio.play() succeeded.'
      );
    } catch (error: any) {
      console.error(
        '[LOLO TTS] Browser audio.play() FAILED:',
        error
      );

      this.isSpeakingActive =
        false;

      this.stopVisemeAnimation();

      this.stopWebAudio();

      /*
       * Chrome/Edge may block audio if it was
       * started without a user interaction.
       */

      if (
        error?.name ===
        'NotAllowedError'
      ) {
        throw new Error(
          'Browser blocked audio playback. Click/tap the page first, then try LOLO again.'
        );
      }

      throw error;
    }
  }

  private stopWebAudio(): void {
    if (
      this.currentWebAudio
    ) {
      try {
        this.currentWebAudio.pause();
      } catch {}

      try {
        this.currentWebAudio.currentTime =
          0;
      } catch {}

      this.currentWebAudio =
        null;
    }

    if (
      this.currentWebAudioUrl
    ) {
      try {
        URL.revokeObjectURL(
          this.currentWebAudioUrl
        );
      } catch {}

      this.currentWebAudioUrl =
        null;
    }
  }

  // ===========================================================================
  // STOP TTS
  // ===========================================================================

  public stop(): void {
    // Invalidate pending TTS
    this.speechRequestId++;

    void Speech.stop();

    this.isSpeakingActive =
      false;

    // Stop native audio
    if (this.currentSound) {
      const sound =
        this.currentSound;

      this.currentSound =
        null;

      try {
        sound.pause();
      } catch {}

      sound.remove();
    }

    // Stop Web audio
    this.stopWebAudio();

    this.stopVisemeAnimation();
  }

  public async isSpeaking(): Promise<boolean> {
    return this.isSpeakingActive;
  }

  // ===========================================================================
  // SPEECH TO TEXT
  // ===========================================================================

  public isSTTAvailable(): boolean {
    if (this.isWeb) {
      return !!this.recognition;
    }

    return true;
  }

  // ===========================================================================
  // START LISTENING
  // ===========================================================================

  public async startListening(
    onResult: (
      text: string,
      isFinal: boolean
    ) => void,
    onError?: (
      error: any
    ) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    // Stop LOLO talking
    this.stop();

    // -------------------------------------------------------------------------
    // NATIVE MOBILE
    // -------------------------------------------------------------------------

    if (!this.isWeb) {
      try {
        const permission =
          await requestRecordingPermissionsAsync();

        if (!permission.granted) {
          onError?.(
            new Error(
              'Kailangan ng pahintulot sa mikropono upang makapagsalita.'
            )
          );

          return false;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        if (this.nativeRecording) {
          try {
            await this.nativeRecording.stop();
          } catch {}

          this.nativeRecording =
            null;
        }

        const recording =
          new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);

        await recording
          .prepareToRecordAsync();

        recording.record();

        this.nativeRecording =
          recording;

        this.nativeRecordingCallback =
          onResult;

        this.nativeErrorCallback =
          onError || null;

        this.nativeEndCallback =
          onEnd || null;

        this.isListeningActive =
          true;

        console.log(
          '[LOLO STT] Recording started.'
        );

        return true;
      } catch (error: any) {
        console.error(
          '[LOLO STT] Recording error:',
          error
        );

        this.isListeningActive =
          false;

        onError?.(error);

        return false;
      }
    }

    // -------------------------------------------------------------------------
    // WEB
    // -------------------------------------------------------------------------

    if (!this.recognition) {
      onError?.(
        new Error(
          'Speech recognition is not available on this browser.'
        )
      );

      return false;
    }

    try {
      try {
        this.recognition.stop();
      } catch {}

      this.recognition.onresult =
        (event: any) => {
          let interimTranscript =
            '';

          let finalTranscript =
            '';

          for (
            let i =
              event.resultIndex;
            i <
              event.results.length;
            i++
          ) {
            const transcript =
              event.results[i][0]
                .transcript;

            if (
              event.results[i]
                .isFinal
            ) {
              finalTranscript +=
                transcript;
            } else {
              interimTranscript +=
                transcript;
            }
          }

          if (finalTranscript) {
            onResult(
              finalTranscript,
              true
            );
          } else if (
            interimTranscript
          ) {
            onResult(
              interimTranscript,
              false
            );
          }
        };

      this.recognition.onerror =
        (event: any) => {
          console.error(
            '[LOLO STT] Browser error:',
            event.error
          );

          this.isListeningActive =
            false;

          onError?.(
            event.error
          );
        };

      this.recognition.onend =
        () => {
          this.isListeningActive =
            false;

          onEnd?.();
        };

      this.recognition.lang =
        'fil-PH';

      this.recognition.start();

      this.isListeningActive =
        true;

      console.log(
        '[LOLO STT] Browser listening.'
      );

      return true;
    } catch (error: any) {
      console.error(
        '[LOLO STT] Browser start error:',
        error
      );

      this.isListeningActive =
        false;

      onError?.(error);

      return false;
    }
  }

  // ===========================================================================
  // STOP LISTENING
  // ===========================================================================

  public async stopListening(): Promise<void> {
    // -------------------------------------------------------------------------
    // NATIVE MOBILE
    // -------------------------------------------------------------------------

    if (
      !this.isWeb &&
      this.nativeRecording
    ) {
      const recording =
        this.nativeRecording;

      this.nativeRecording =
        null;

      this.isListeningActive =
        false;

      try {
        await recording.stop();

        const uri =
          recording.uri;

        if (!uri) {
          throw new Error(
            'Could not get recording URI.'
          );
        }

        console.log(
          '[LOLO STT] Recording saved:',
          uri
        );

        const base64Audio =
          await FileSystem
            .readAsStringAsync(
              uri,
              {
                encoding:
                  FileSystem.EncodingType
                    .Base64,
              }
            );

        if (!base64Audio) {
          throw new Error(
            'Recording was empty.'
          );
        }

        const sttResult =
          await sendLoloAudioSTT({
            audio: base64Audio,
            mimeType:
              'audio/m4a',
            language:
              'fil',
          });

        if (
          sttResult.success &&
          sttResult.text
        ) {
          this.nativeRecordingCallback?.(
            sttResult.text,
            true
          );
        } else {
          this.nativeErrorCallback?.(
            new Error(
              'Hindi naintindihan ang boses.'
            )
          );
        }
      } catch (error: any) {
        console.error(
          '[LOLO STT] Processing error:',
          error
        );

        this.nativeErrorCallback?.(
          error
        );
      } finally {
        this.nativeEndCallback?.();

        this.nativeRecordingCallback =
          null;

        this.nativeErrorCallback =
          null;

        this.nativeEndCallback =
          null;

        try {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          });
        } catch {}
      }

      return;
    }

    // -------------------------------------------------------------------------
    // WEB
    // -------------------------------------------------------------------------

    if (
      this.recognition &&
      this.isListeningActive
    ) {
      try {
        this.recognition.stop();
      } catch {}

      this.isListeningActive =
        false;
    }
  }

  // ===========================================================================
  // LISTENING STATE
  // ===========================================================================

  public isListening(): boolean {
    return this.isListeningActive;
  }
}

// ===========================================================================
// SINGLETON
// ===========================================================================

export const speechEngine =
  new SpeechEngine();