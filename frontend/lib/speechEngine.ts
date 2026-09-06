/**
 * frontend/lib/speechEngine.ts
 *
 * LOLO PAT Speech Engine
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
 *   Viseme animation while ElevenLabs audio is playing
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { sendLoloAudioSTT } from '../services/loloApi';

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

  // Native ElevenLabs audio
  private currentSound: Audio.Sound | null = null;

  // Web ElevenLabs audio
  private currentWebAudio: any = null;
  private currentWebAudioUrl: string | null = null;

  // Prevent old TTS requests from playing
  private speechRequestId = 0;

  // Native recording
  private nativeRecording: Audio.Recording | null = null;

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

  private startVisemeAnimation(): void {
    this.stopVisemeAnimation();

    let frame = 0;

    this.visemeTimer = setInterval(() => {
      frame++;

      const wave =
        (Math.sin(frame * 0.28) + 1) / 2;

      const microMod =
        Math.sin(frame * 0.56) * 0.2;

      const amplitude = Math.max(
        0.08,
        Math.min(
          0.92,
          wave * 0.7 +
            microMod +
            0.15
        )
      );

      const phonemes = [
        'A',
        'E',
        'O',
        'A',
        'U',
        'M',
      ];

      const phoneme =
        phonemes[
          Math.floor(frame / 2) %
            phonemes.length
        ];

      this.emitViseme(
        amplitude,
        phoneme
      );
    }, 50);
  }

  private stopVisemeAnimation(): void {
    if (this.visemeTimer) {
      clearInterval(this.visemeTimer);
      this.visemeTimer = null;
    }

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
          : 'http://192.168.0.104:5000';

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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // -----------------------------------------------------------------------
      // CREATE SOUND
      // -----------------------------------------------------------------------

      console.log(
        '[LOLO TTS] Loading MP3...'
      );

      const {
        sound,
        status,
      } =
        await Audio.Sound.createAsync(
          { uri: fileUri },

          {
            shouldPlay: false,
            volume: 1.0,
            rate: 1.0,
            shouldCorrectPitch: true,
            progressUpdateIntervalMillis: 50,
          }
        );

      if (!status.isLoaded) {
        throw new Error(
          'Expo Audio failed to load MP3.'
        );
      }

      this.currentSound =
        sound;

      // -----------------------------------------------------------------------
      // PLAYBACK CALLBACK
      // -----------------------------------------------------------------------

      sound.setOnPlaybackStatusUpdate(
        (playbackStatus) => {
          if (
            !playbackStatus.isLoaded
          ) {
            console.error(
              '[LOLO TTS] Playback error:',
              playbackStatus.error
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

            void sound
              .unloadAsync()
              .catch(() => {});

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
          await sound.unloadAsync();
        } catch {}

        return;
      }

      console.log(
        '[LOLO TTS] STARTING NATIVE AUDIO'
      );

      onStart?.();

      this.startVisemeAnimation();

      await sound.playAsync();

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
          await sound.stopAsync();
        } catch {}

        try {
          await sound.unloadAsync();
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

      this.startVisemeAnimation();

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

    this.isSpeakingActive =
      false;

    // Stop native audio
    if (this.currentSound) {
      const sound =
        this.currentSound;

      this.currentSound =
        null;

      void sound
        .stopAsync()
        .catch(() => {})
        .finally(() => {
          void sound
            .unloadAsync()
            .catch(() => {});
        });
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
          await Audio.requestPermissionsAsync();

        if (!permission.granted) {
          onError?.(
            new Error(
              'Kailangan ng pahintulot sa mikropono upang makapagsalita.'
            )
          );

          return false;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        if (this.nativeRecording) {
          try {
            await this.nativeRecording
              .stopAndUnloadAsync();
          } catch {}

          this.nativeRecording =
            null;
        }

        const recording =
          new Audio.Recording();

        await recording
          .prepareToRecordAsync(
            Audio.RecordingOptionsPresets
              .HIGH_QUALITY
          );

        await recording.startAsync();

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
        await recording
          .stopAndUnloadAsync();

        const uri =
          recording.getURI();

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
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
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