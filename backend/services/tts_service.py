"""
backend/services/tts_service.py

─────────────────────────────────────────────────────────────────────────────
Text-to-Speech (TTS) Service for LOLO PAT AI Companion — Phase 7.

Handles:
- Text cleaning
- Speech parameter calculation
- Viseme generation for lip-sync
- ElevenLabs voice synthesis
- Character alignment data
- Concurrent-request protection
─────────────────────────────────────────────────────────────────────────────
"""

import os
import re
import threading
from typing import Dict, Any, List, Optional

import requests

from config import Config


# ─────────────────────────────────────────────────────────────────────────────
# ElevenLabs concurrency protection
# ─────────────────────────────────────────────────────────────────────────────
#
# Your ElevenLabs subscription currently allows a maximum of 2 concurrent
# requests. We use a single lock so LOLO sends only ONE ElevenLabs request
# at a time from this Flask process.
#
# This prevents:
#
#   Request 1 ─┐
#   Request 2 ─┼─→ 429 concurrent_limit_exceeded
#   Request 3 ─┘
#
# and instead does:
#
#   Request 1 → finishes
#   Request 2 → finishes
#   Request 3 → finishes
#
ELEVENLABS_TTS_LOCK = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Filipino Phoneme & Viseme Mapping
# ─────────────────────────────────────────────────────────────────────────────
#
# Viseme IDs:
#
# 0 = silence / closed
# 1 = aa / ah (open)
# 2 = ee / iy (wide)
# 3 = oh / oo (round)
# 4 = bmp (closed lips)
# 5 = fv (teeth-lip)
# 6 = th / s / t (dental)
#

PHONEME_TO_VISEME: Dict[str, int] = {
    "a": 1,
    "á": 1,
    "à": 1,

    "e": 2,
    "é": 2,
    "i": 2,
    "í": 2,

    "o": 3,
    "ó": 3,
    "u": 3,
    "ú": 3,

    "b": 4,
    "m": 4,
    "p": 4,

    "f": 5,
    "v": 5,

    "t": 6,
    "d": 6,
    "s": 6,
    "z": 6,
    "n": 6,
    "l": 6,
    "r": 6,

    "k": 1,
    "g": 1,
    "h": 1,
    "y": 2,
    "w": 3,
}


# ─────────────────────────────────────────────────────────────────────────────
# TEXT CLEANING
# ─────────────────────────────────────────────────────────────────────────────

def clean_text_for_speech(text: str) -> str:
    """
    Removes action tags and markdown before speech synthesis.
    """

    if not text:
        return ""

    # Remove [ACTION:SOMETHING]
    cleaned = re.sub(
        r"\[ACTION:[A-Z_]+\]",
        "",
        text
    )

    # Remove common markdown characters
    cleaned = re.sub(
        r"[\*\_#`~>]",
        "",
        cleaned
    )

    # Normalize whitespace
    cleaned = re.sub(
        r"\s+",
        " ",
        cleaned
    ).strip()

    return cleaned


# ─────────────────────────────────────────────────────────────────────────────
# SPEECH DURATION
# ─────────────────────────────────────────────────────────────────────────────

def estimate_speech_duration_ms(
    text: str,
    speech_rate: float = 0.92
) -> int:
    """
    Estimates speech duration in milliseconds.

    This is used for fallback/synthetic viseme timing.
    """

    clean = clean_text_for_speech(text)

    if not clean:
        return 0

    words = clean.split()
    word_count = len(words)

    # Approximately 400 ms per word at rate 1.0
    base_ms = (
        word_count * 400
    ) / max(
        0.5,
        min(2.0, speech_rate)
    )

    # Add approximate punctuation pauses
    pauses = (
        clean.count(",") * 200
        + clean.count(".") * 350
        + clean.count("!") * 350
        + clean.count("?") * 350
    )

    return int(base_ms + pauses)


# ─────────────────────────────────────────────────────────────────────────────
# VISEME GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def generate_visemes_for_text(
    text: str,
    speech_rate: float = 0.92
) -> List[Dict[str, Any]]:
    """
    Generates timed viseme keyframes for the 3D Barong Elder avatar.

    Each keyframe contains:
    - timeMs
    - visemeId
    - amplitude
    - phoneme
    """

    clean = clean_text_for_speech(text)

    if not clean:
        return []

    duration_ms = estimate_speech_duration_ms(
        clean,
        speech_rate
    )

    chars = [
        c.lower()
        for c in clean
        if c.isalnum() or c.isspace()
    ]

    if not chars:
        return []

    time_step_ms = max(
        50,
        int(
            duration_ms / max(1, len(chars))
        )
    )

    visemes: List[Dict[str, Any]] = []

    current_time_ms = 0

    for ch in chars:

        # Space = closed/silent mouth
        if ch.isspace():

            visemes.append({
                "timeMs": current_time_ms,
                "visemeId": 0,
                "amplitude": 0.0,
                "phoneme": "silence",
            })

            current_time_ms += int(
                time_step_ms * 1.5
            )

            continue

        viseme_id = PHONEME_TO_VISEME.get(
            ch,
            1
        )

        # Natural-ish mouth amplitude
        if viseme_id in (1, 3):
            amplitude = 0.85

        elif viseme_id == 2:
            amplitude = 0.65

        else:
            amplitude = 0.45

        visemes.append({
            "timeMs": current_time_ms,
            "visemeId": viseme_id,
            "amplitude": amplitude,
            "phoneme": ch.upper(),
        })

        current_time_ms += time_step_ms

    # Final closed mouth
    visemes.append({
        "timeMs": current_time_ms + 100,
        "visemeId": 0,
        "amplitude": 0.0,
        "phoneme": "silence",
    })

    return visemes


# ─────────────────────────────────────────────────────────────────────────────
# TTS SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class TTSService:
    """
    Core Text-to-Speech service for LOLO PAT.
    """

    ELEVENLABS_API_URL = (
        "https://api.elevenlabs.io/v1/text-to-speech"
    )

    ELEVENLABS_MODEL = (
        "eleven_multilingual_v2"
    )

    # IMPORTANT:
    # Read the voice ID from the environment.
    #
    # Your .env should contain:
    #
    # ELEVENLABS_VOICE_ID=pqHfZKP75CvOlQylNhV4
    #
    ELEVENLABS_VOICE_ID = os.getenv(
        "ELEVENLABS_VOICE_ID",
        "pqHfZKP75CvOlQylNhV4"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # ELEVENLABS AUDIO
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def generate_elevenlabs_audio(
        cls,
        text: str,
        speech_rate: float = 0.92,
    ) -> Dict[str, Any]:
        """
        Generates actual speech audio using ElevenLabs.

        Returns:
            audioBase64
            alignment
            normalizedAlignment
        """

        api_key = os.getenv(
            "ELEVENLABS_API_KEY"
        )

        if not api_key:
            raise RuntimeError(
                "ELEVENLABS_API_KEY is not configured."
            )

        # Make sure the latest environment value is used.
        voice_id = os.getenv(
            "ELEVENLABS_VOICE_ID",
            cls.ELEVENLABS_VOICE_ID
        )

        url = (
            f"{cls.ELEVENLABS_API_URL}/"
            f"{voice_id}/with-timestamps"
        )

        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
        }

        # Keep rate within ElevenLabs' expected range.
        speech_rate = max(
            0.7,
            min(1.2, float(speech_rate))
        )

        payload = {
            "text": text,

            "model_id": cls.ELEVENLABS_MODEL,

            "voice_settings": {
                "stability": 0.55,
                "similarity_boost": 0.80,
                "style": 0.15,
                "use_speaker_boost": True,
                "speed": speech_rate,
            },
        }

        # ─────────────────────────────────────────────────────────────────────
        # CRITICAL FIX:
        #
        # Only one request from this Flask process may call ElevenLabs at once.
        # ─────────────────────────────────────────────────────────────────────

        with ELEVENLABS_TTS_LOCK:

            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=60,
            )

        # ─────────────────────────────────────────────────────────────────────
        # ERROR HANDLING
        # ─────────────────────────────────────────────────────────────────────

        if not response.ok:

            # Special handling for ElevenLabs 429
            if response.status_code == 429:

                raise RuntimeError(
                    "ElevenLabs rate limit reached. "
                    "Please wait a moment before trying again. "
                    f"Details: {response.text}"
                )

            raise RuntimeError(
                f"ElevenLabs error "
                f"{response.status_code}: "
                f"{response.text}"
            )

        # ─────────────────────────────────────────────────────────────────────
        # PARSE RESPONSE
        # ─────────────────────────────────────────────────────────────────────

        result = response.json()

        audio_base64 = result.get(
            "audio_base64"
        )

        if not audio_base64:
            raise RuntimeError(
                "ElevenLabs returned no audio data."
            )

        return {
            "audioBase64": audio_base64,

            "alignment": result.get(
                "alignment"
            ),

            "normalizedAlignment": result.get(
                "normalized_alignment"
            ),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # PROCESS TTS REQUEST
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def process_tts_request(
        cls,
        text: str,
        language: str = "fil",
        speech_rate: Optional[float] = None,
        speech_pitch: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Processes a TTS request and generates ElevenLabs audio.
        """

        # Clean text first
        clean_text = clean_text_for_speech(
            text
        )

        if not clean_text:

            return {
                "success": False,
                "error": "No text to synthesize.",
            }

        # Speech rate
        rate = (
            speech_rate
            if speech_rate is not None
            else Config.LOLO_TTS_RATE
        )

        # Speech pitch
        #
        # ElevenLabs does not use this value directly,
        # but we keep it in the API response for compatibility
        # with your existing LOLO system.
        pitch = (
            speech_pitch
            if speech_pitch is not None
            else Config.LOLO_TTS_PITCH
        )

        # Language
        lang = (
            language
            or Config.LOLO_LANGUAGE
        )

        # ─────────────────────────────────────────────────────────────────────
        # Generate fallback/synthetic viseme timing
        # ─────────────────────────────────────────────────────────────────────

        duration_ms = estimate_speech_duration_ms(
            clean_text,
            rate
        )

        visemes = generate_visemes_for_text(
            clean_text,
            rate
        )

        # ─────────────────────────────────────────────────────────────────────
        # Generate REAL ElevenLabs audio
        # ─────────────────────────────────────────────────────────────────────

        audio_result = (
            cls.generate_elevenlabs_audio(
                clean_text,
                speech_rate=rate,
            )
        )

        # ─────────────────────────────────────────────────────────────────────
        # RETURN COMPLETE RESULT
        # ─────────────────────────────────────────────────────────────────────

        return {
            "success": True,

            "text": clean_text,

            "language": lang,

            "speechRate": rate,

            "speechPitch": pitch,

            "durationMs": duration_ms,

            "visemes": visemes,

            "voiceName": "ElevenLabs",

            "voiceId": os.getenv(
                "ELEVENLABS_VOICE_ID",
                cls.ELEVENLABS_VOICE_ID
            ),

            "audioBase64": (
                audio_result["audioBase64"]
            ),

            "alignment": (
                audio_result["alignment"]
            ),

            "normalizedAlignment": (
                audio_result["normalizedAlignment"]
            ),
        }