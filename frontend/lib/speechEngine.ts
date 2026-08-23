/**
 * speechEngine.ts — Zero-delay Filipino Speech-to-Text, Text-to-Speech & Viseme Lip-Sync Engine
 * Tailored for AUREA's "Lolo Aurea" Senior Citizen AI Assistant.
 */

import { Platform } from 'react-native';

export type VisemeCallback = (amplitude: number, phoneme: string) => void;

class SpeechEngine {
  private synth: any = null;
  private recognition: any = null;
  private voices: any[] = [];
  private selectedVoice: any = null;
  private isListeningActive: boolean = false;
  private speechQueue: string[] = [];
  private isSpeakingQueueActive: boolean = false;
  private visemeListeners: Set<VisemeCallback> = new Set();
  private visemeTimer: any = null;

  constructor() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
          this.synth.onvoiceschanged = () => this.loadVoices();
        }
      }

      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        // fil-PH for Filipino/Tagalog recognition
        this.recognition.lang = 'fil-PH';
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices() || [];
    
    // Prioritize Filipino / Tagalog voice, then en-PH, then natural male voices
    this.selectedVoice =
      this.voices.find(
        (v) =>
          v.lang.startsWith('fil') ||
          v.lang.startsWith('tl') ||
          v.name.toLowerCase().includes('filipino') ||
          v.name.toLowerCase().includes('tagalog')
      ) ||
      this.voices.find(
        (v) =>
          v.lang === 'en-PH' ||
          v.name.toLowerCase().includes('philippine') ||
          v.name.toLowerCase().includes('filipino')
      ) ||
      this.voices.find(
        (v) =>
          v.name.toLowerCase().includes('natural') ||
          v.name.toLowerCase().includes('grandpa') ||
          v.name.toLowerCase().includes('male') ||
          v.name.toLowerCase().includes('george') ||
          v.name.toLowerCase().includes('david')
      ) ||
      this.voices[0] ||
      null;
  }

  public registerVisemeListener(cb: VisemeCallback) {
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

  // --- Real-time Lip-Sync Simulation on Web Speech ---
  private startVisemeAnimation() {
    this.stopVisemeAnimation();
    let frame = 0;
    this.visemeTimer = setInterval(() => {
      frame++;
      // Natural cadence waveform simulating Filipino syllables (ma-gan-dang a-raw)
      const baseAmp = (Math.sin(frame * 0.45) + 1) / 2;
      const noise = (Math.sin(frame * 0.9) * 0.25);
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

  // --- Zero-Delay Text-to-Speech (TTS) ---
  public speak(
    text: string,
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    if (!this.synth) {
      if (onStart) onStart();
      this.startVisemeAnimation();
      setTimeout(() => {
        this.stopVisemeAnimation();
        if (onEnd) onEnd();
      }, Math.min(text.length * 70, 6000));
      return;
    }

    // Clean text of action tags like [ACTION:NAVIGATE_DIGITAL_ID]
    const cleanText = text.replace(/\[ACTION:[A-Z_]+\]/g, '').trim();
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    this.stop(); // Cancel current speech

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    // Senior-friendly warm grandfather tone
    utterance.rate = 0.93; // Slightly slower, very articulate
    utterance.pitch = 0.95; // Warm, gentle grandfather tone
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.startVisemeAnimation();
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.stopVisemeAnimation();
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.stopVisemeAnimation();
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  public stop(): void {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {}
    }
    this.stopVisemeAnimation();
  }

  // --- Speech-to-Text (STT) ---
  public isSTTAvailable(): boolean {
    return Platform.OS === 'web' && !!this.recognition;
  }

  public startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onError?: (error: any) => void,
    onEnd?: () => void
  ): boolean {
    if (!this.recognition) {
      if (onError) onError(new Error('Speech recognition not available on this device/browser'));
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
        if (onError) onError(event.error);
        this.isListeningActive = false;
      };

      this.recognition.onend = () => {
        this.isListeningActive = false;
        if (onEnd) onEnd();
      };

      this.recognition.start();
      this.isListeningActive = true;
      return true;
    } catch (err) {
      if (onError) onError(err);
      this.isListeningActive = false;
      return false;
    }
  }

  public stopListening(): void {
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
