/**
 * frontend/lib/speechEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-Platform Speech-to-Text (STT), Text-to-Speech (TTS) & Viseme Lip-Sync
 * Engine for LOLO PAT.
 *
 * Supports:
 *   - Native Android & iOS Speech-to-Text via `expo-av` + Multimodal Gemini STT
 *   - Web Browsers Speech-to-Text via HTML5 `SpeechRecognition`
 *   - Native Android & iOS Text-to-Speech via `expo-speech`
 *   - Web Browsers Text-to-Speech via HTML5 `speechSynthesis`
 *   - Real-time Viseme & Audio Waveform dispatching for 3D Barong Elder mouth sync
 *   - Senior-friendly voice tuning (rate: 0.92, pitch: 0.95)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { sendLoloAudioSTT } from '../services/loloApi';

export type VisemeCallback = (amplitude: number, phoneme: string) => void;

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
  private isWeb: boolean = Platform.OS === 'web';
  private synth: any = null;
  private recognition: any = null;
  private webVoices: any[] = [];
  private selectedWebVoice: any = null;
  private selectedNativeVoice: string | null = null;
  private isSpeakingActive: boolean = false;
  private isListeningActive: boolean = false;
  private visemeListeners: Set<VisemeCallback> = new Set();
  private visemeTimer: any = null;

  // Native audio recording state
  private nativeRecording: Audio.Recording | null = null;
  private nativeRecordingCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private nativeErrorCallback: ((error: any) => void) | null = null;
  private nativeEndCallback: (() => void) | null = null;

  constructor() {
    this.initEngine();
  }

  private async initEngine() {
    if (this.isWeb && typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
        this.loadWebVoices();
        if (this.synth.onvoiceschanged !== undefined) {
          this.synth.onvoiceschanged = () => this.loadWebVoices();
        }
      }

      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'fil-PH';
      }
    } else {
      // Native Android / iOS init
      try {
        const nativeVoices = await Speech.getAvailableVoicesAsync();
        const filipinoVoice = nativeVoices.find(
          (v) =>
            v.language?.toLowerCase().startsWith('fil') ||
            v.language?.toLowerCase().startsWith('tl') ||
            v.name?.toLowerCase().includes('filipino') ||
            v.name?.toLowerCase().includes('tagalog')
        );

        if (filipinoVoice) {
          this.selectedNativeVoice = filipinoVoice.identifier;
        }
      } catch {}
    }
  }

  private loadWebVoices() {
    if (!this.synth) return;
    this.webVoices = this.synth.getVoices() || [];

    // Prioritize Filipino / Tagalog voice, then en-PH, then natural male voices
    this.selectedWebVoice =
      this.webVoices.find(
        (v) =>
          v.lang?.startsWith('fil') ||
          v.lang?.startsWith('tl') ||
          v.name?.toLowerCase().includes('filipino') ||
          v.name?.toLowerCase().includes('tagalog')
      ) ||
      this.webVoices.find(
        (v) =>
          v.lang === 'en-PH' ||
          v.name?.toLowerCase().includes('philippine') ||
          v.name?.toLowerCase().includes('filipino')
      ) ||
      this.webVoices.find(
        (v) =>
          v.name?.toLowerCase().includes('natural') ||
          v.name?.toLowerCase().includes('grandpa') ||
          v.name?.toLowerCase().includes('male') ||
          v.name?.toLowerCase().includes('george') ||
          v.name?.toLowerCase().includes('david')
      ) ||
      this.webVoices[0] ||
      null;
  }

  // ─── Viseme / Lip-Sync Event Management ────────────────────────────────────

  public registerVisemeListener(cb: VisemeCallback): () => void {
    this.visemeListeners.add(cb);
    return () => {
      this.visemeListeners.delete(cb);
    };
  }

  private emitViseme(amplitude: number, phoneme: string = 'A') {
    this.visemeListeners.forEach((cb) => {
      try {
        cb(amplitude, phoneme);
      } catch {}
    });
  }

  private startVisemeAnimation() {
    this.stopVisemeAnimation();
    let frame = 0;
    this.visemeTimer = setInterval(() => {
      frame++;
      // Natural cadence waveform simulating Filipino syllables (ma-gan-dang a-raw)
      const baseAmp = (Math.sin(frame * 0.45) + 1) / 2;
      const noise = Math.sin(frame * 0.9) * 0.25;
      const amp = Math.max(0.1, Math.min(1.0, baseAmp * 0.75 + noise + 0.15));
      const phonemes = ['A', 'O', 'E', 'M', 'U'];
      const phoneme = phonemes[frame % phonemes.length];
      this.emitViseme(amp, phoneme);
    }, 60);
  }

  private stopVisemeAnimation() {
    if (this.visemeTimer) {
      clearInterval(this.visemeTimer);
      this.visemeTimer = null;
    }
    this.emitViseme(0.0, 'neutral');
  }

  // ─── Text-to-Speech (TTS) Execution ────────────────────────────────────────

  /**
   * Speaks the given text using Native TTS (Android/iOS) or Web Speech Synthesis.
   * Cleans any bracketed system actions `[ACTION:...]` and drives 3D lip-sync visemes.
   */
  public speak(
    text: string,
    onStart?: () => void,
    onEnd?: () => void,
    options?: SpeechOptions
  ): void {
    const cleanText = text.replace(/\[ACTION:[A-Z_]+\]/g, '').trim();
    if (!cleanText) {
      onEnd?.();
      return;
    }

    this.stop();
    this.isSpeakingActive = true;

    const rate = options?.rate ?? 0.92; // Warm, senior-friendly articulate pace
    const pitch = options?.pitch ?? 0.95; // Warm grandfather pitch
    const lang = options?.language ?? 'fil-PH';

    // ── Native Mobile TTS (Android & iOS) ──────────────────────────────────
    if (!this.isWeb) {
      this.startVisemeAnimation();
      onStart?.();

      Speech.speak(cleanText, {
        language: lang,
        pitch,
        rate,
        voice: options?.voiceIdentifier || this.selectedNativeVoice || undefined,
        onStart: () => {
          this.isSpeakingActive = true;
        },
        onDone: () => {
          this.isSpeakingActive = false;
          this.stopVisemeAnimation();
          onEnd?.();
        },
        onStopped: () => {
          this.isSpeakingActive = false;
          this.stopVisemeAnimation();
          onEnd?.();
        },
        onError: (err) => {
          this.isSpeakingActive = false;
          this.stopVisemeAnimation();
          options?.onError?.(err);
          onEnd?.();
        },
      });
      return;
    }

    // ── Web Speech Synthesis (Expo Web / Browser) ───────────────────────────
    if (!this.synth) {
      onStart?.();
      this.startVisemeAnimation();
      setTimeout(() => {
        this.stopVisemeAnimation();
        this.isSpeakingActive = false;
        onEnd?.();
      }, Math.min(cleanText.length * 70, 6000));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (this.selectedWebVoice) {
      utterance.voice = this.selectedWebVoice;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1.0;
    utterance.lang = lang;

    utterance.onstart = () => {
      this.isSpeakingActive = true;
      this.startVisemeAnimation();
      onStart?.();
    };

    utterance.onend = () => {
      this.isSpeakingActive = false;
      this.stopVisemeAnimation();
      onEnd?.();
    };

    utterance.onerror = (err) => {
      this.isSpeakingActive = false;
      this.stopVisemeAnimation();
      options?.onError?.(err);
      onEnd?.();
    };

    this.synth.speak(utterance);
  }

  public stop(): void {
    this.isSpeakingActive = false;

    if (!this.isWeb) {
      try {
        Speech.stop();
      } catch {}
    } else if (this.synth) {
      try {
        this.synth.cancel();
      } catch {}
    }

    this.stopVisemeAnimation();
  }

  public async isSpeaking(): Promise<boolean> {
    if (!this.isWeb) {
      return await Speech.isSpeakingAsync();
    }
    return this.isSpeakingActive;
  }

  // ─── Speech-to-Text (STT) ──────────────────────────────────────────────────

  public isSTTAvailable(): boolean {
    if (this.isWeb) {
      return !!this.recognition;
    }
    return true; // Available on Native Android & iOS via expo-av microphone recording
  }

  /**
   * Starts listening / recording microphone input.
   * - On Web: Uses Web Speech Recognition.
   * - On Native Android & iOS: Records microphone audio via `expo-av`.
   */
  public async startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onError?: (error: any) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    this.stop(); // Ensure TTS is quiet while user speaks

    // ── Native Mobile STT (Android & iOS) ──────────────────────────────────
    if (!this.isWeb) {
      try {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          onError?.(new Error('Kailangan ng pahintulot sa mikropono upang makapagsalita.'));
          return false;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        if (this.nativeRecording) {
          try {
            await this.nativeRecording.stopAndUnloadAsync();
          } catch {}
          this.nativeRecording = null;
        }

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();

        this.nativeRecording = recording;
        this.nativeRecordingCallback = onResult;
        this.nativeErrorCallback = onError || null;
        this.nativeEndCallback = onEnd || null;
        this.isListeningActive = true;
        return true;
      } catch (err: any) {
        this.isListeningActive = false;
        onError?.(err);
        return false;
      }
    }

    // ── Web Speech Recognition ─────────────────────────────────────────────
    if (!this.recognition) {
      onError?.(new Error('Speech recognition not available on this web browser'));
      return false;
    }

    try {
      this.stopListening();

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          onResult(finalTranscript, true);
        } else if (interimTranscript) {
          onResult(interimTranscript, false);
        }
      };

      this.recognition.onerror = (event: any) => {
        onError?.(event.error);
        this.isListeningActive = false;
      };

      this.recognition.onend = () => {
        this.isListeningActive = false;
        onEnd?.();
      };

      this.recognition.start();
      this.isListeningActive = true;
      return true;
    } catch (err) {
      onError?.(err);
      this.isListeningActive = false;
      return false;
    }
  }

  /**
   * Stops listening / ends microphone recording and performs transcription.
   */
  public async stopListening(): Promise<void> {
    // ── Native Mobile STT Finish & Transcribe ──────────────────────────────
    if (!this.isWeb && this.nativeRecording) {
      const recording = this.nativeRecording;
      this.nativeRecording = null;
      this.isListeningActive = false;

      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();

        if (uri) {
          const base64Audio = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64' as any,
          });

          if (base64Audio) {
            const sttResult = await sendLoloAudioSTT({
              audio: base64Audio,
              mimeType: 'audio/m4a',
              language: 'fil',
            });

            if (sttResult.success && sttResult.text) {
              this.nativeRecordingCallback?.(sttResult.text, true);
            } else {
              this.nativeErrorCallback?.(new Error('Hindi naintindihan ang boses.'));
            }
          }
        }
      } catch (err) {
        this.nativeErrorCallback?.(err);
      } finally {
        this.nativeEndCallback?.();
      }
      return;
    }

    // ── Web Speech Recognition Stop ────────────────────────────────────────
    if (this.recognition && this.isListeningActive) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListeningActive = false;
    }
  }

  public isListening(): boolean {
    return this.isListeningActive;
  }
}

export const speechEngine = new SpeechEngine();
