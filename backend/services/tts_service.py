"""
backend/services/tts_service.py
─────────────────────────────────────────────────────────────────────────────
Text-to-Speech (TTS) Service for LOLO PAT AI Companion — Phase 7.

Handles speech parameter calculation, viseme generation for lip-sync,
and voice synthesis metadata for both Filipino (Tagalog) and English.
─────────────────────────────────────────────────────────────────────────────
"""

import re
import math
from typing import Dict, Any, List, Optional
from config import Config


# ─── Filipino Phoneme & Viseme Mapping ────────────────────────────────────────

# Viseme IDs for mouth shapes:
# 0: silence/closed, 1: aa/ah (open), 2: ee/iy (wide), 3: oh/oo (round), 4: bmp (closed lips), 5: fv (teeth-lip), 6: th/s/t (dental)
PHONEME_TO_VISEME: Dict[str, int] = {
    "a": 1, "á": 1, "à": 1,
    "e": 2, "é": 2, "i": 2, "í": 2,
    "o": 3, "ó": 3, "u": 3, "ú": 3,
    "b": 4, "m": 4, "p": 4,
    "f": 5, "v": 5,
    "t": 6, "d": 6, "s": 6, "z": 6, "n": 6, "l": 6, "r": 6,
    "k": 1, "g": 1, "h": 1, "y": 2, "w": 3,
}


def clean_text_for_speech(text: str) -> str:
    """Removes action tags [ACTION:...] and markdown before speech synthesis."""
    if not text:
        return ""
    # Strip bracketed system actions
    cleaned = re.sub(r"\[ACTION:[A-Z_]+\]", "", text)
    # Strip markdown symbols (*, _, #, `, etc.)
    cleaned = re.sub(r"[\*\_#`~>]", "", cleaned)
    # Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def estimate_speech_duration_ms(text: str, speech_rate: float = 0.92) -> int:
    """
    Estimates speech duration in milliseconds based on syllable/word count and speech rate.
    Average speaking speed: ~150 words per minute (normal), adjusted by speech_rate.
    """
    clean = clean_text_for_speech(text)
    if not clean:
        return 0
    words = clean.split()
    word_count = len(words)
    # Base ms per word ~ 400ms at 1.0 rate
    base_ms = (word_count * 400) / max(0.5, min(2.0, speech_rate))
    # Add buffer for punctuation pauses
    pauses = clean.count(",") * 200 + clean.count(".") * 350 + clean.count("!") * 350 + clean.count("?") * 350
    return int(base_ms + pauses)


def generate_visemes_for_text(text: str, speech_rate: float = 0.92) -> List[Dict[str, Any]]:
    """
    Generates timed viseme keyframes (time in ms, viseme ID, amplitude, and phoneme)
    for lip-sync animation of the 3D Barong Elder avatar.
    """
    clean = clean_text_for_speech(text)
    if not clean:
        return []

    duration_ms = estimate_speech_duration_ms(clean, speech_rate)
    chars = [c.lower() for c in clean if c.isalnum() or c.isspace()]
    if not chars:
        return []

    time_step_ms = max(50, int(duration_ms / max(1, len(chars))))
    visemes: List[Dict[str, Any]] = []

    current_time_ms = 0
    for i, ch in enumerate(chars):
        if ch.isspace():
            visemes.append({
                "timeMs": current_time_ms,
                "visemeId": 0,
                "amplitude": 0.0,
                "phoneme": "silence",
            })
            current_time_ms += int(time_step_ms * 1.5)
            continue

        viseme_id = PHONEME_TO_VISEME.get(ch, 1)
        # Compute dynamic natural syllable amplitude
        amp = 0.85 if viseme_id in (1, 3) else (0.65 if viseme_id == 2 else 0.45)
        visemes.append({
            "timeMs": current_time_ms,
            "visemeId": viseme_id,
            "amplitude": amp,
            "phoneme": ch.upper(),
        })
        current_time_ms += time_step_ms

    # End with closed mouth
    visemes.append({
        "timeMs": current_time_ms + 100,
        "visemeId": 0,
        "amplitude": 0.0,
        "phoneme": "silence",
    })

    return visemes


class TTSService:
    """Core Text-to-Speech service for LOLO PAT."""

    @staticmethod
    def process_tts_request(
        text: str,
        language: str = "fil",
        speech_rate: Optional[float] = None,
        speech_pitch: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Processes a TTS synthesis request. Returns normalized text, recommended audio
        synthesis parameters, estimated duration, and timed viseme lip-sync track.
        """
        clean_text = clean_text_for_speech(text)
        rate = speech_rate if speech_rate is not None else Config.LOLO_TTS_RATE
        pitch = speech_pitch if speech_pitch is not None else Config.LOLO_TTS_PITCH
        lang = language or Config.LOLO_LANGUAGE

        duration_ms = estimate_speech_duration_ms(clean_text, rate)
        visemes = generate_visemes_for_text(clean_text, rate)

        return {
            "success": True,
            "text": clean_text,
            "language": lang,
            "speechRate": rate,
            "speechPitch": pitch,
            "durationMs": duration_ms,
            "visemes": visemes,
            "voiceName": "fil-PH-Standard-A" if lang.startswith("fil") or lang.startswith("tl") else "en-US-Standard-B",
        }
