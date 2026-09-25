"""
backend/services/tts_service.py

Text-to-Speech service for LOLO PAT.
Uses free Microsoft neural voices through edge-tts:
no API key, no credits, no quota.

Returns the same fields the app already expects:
audioBase64, alignment, normalizedAlignment, visemes, durationMs.
"""

import asyncio
import base64
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Optional

import edge_tts

from config import Config


# Male Filipino voice. For a female voice use "fil-PH-BlessicaNeural".
# You can also set EDGE_TTS_VOICE in your .env.
TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "fil-PH-AngeloNeural")

# Generated audio is saved here, so repeated lines are instant.
CACHE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "tts_cache",
)
os.makedirs(CACHE_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# Filipino phoneme -> viseme mapping
# 0 silence, 1 aa, 2 ee, 3 oh/oo, 4 bmp, 5 fv, 6 dental
# ─────────────────────────────────────────────────────────────────────────────

PHONEME_TO_VISEME: Dict[str, int] = {
    "a": 1, "á": 1, "à": 1,
    "e": 2, "é": 2, "i": 2, "í": 2,
    "o": 3, "ó": 3, "u": 3, "ú": 3,
    "b": 4, "m": 4, "p": 4,
    "f": 5, "v": 5,
    "t": 6, "d": 6, "s": 6, "z": 6, "n": 6, "l": 6, "r": 6,
    "k": 1, "g": 1, "h": 1,
    "y": 2, "w": 3,
}


# ─────────────────────────────────────────────────────────────────────────────
# Text cleaning
# ─────────────────────────────────────────────────────────────────────────────

def clean_text_for_speech(text: str) -> str:
    """Removes action tags and markdown before speech synthesis."""
    if not text:
        return ""

    cleaned = re.sub(r"\[ACTION:[A-Z_]+\]", "", text)
    cleaned = re.sub(r"[\*\_#`~>]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


# ─────────────────────────────────────────────────────────────────────────────
# Speech duration (fallback / synthetic viseme timing)
# ─────────────────────────────────────────────────────────────────────────────

def estimate_speech_duration_ms(text: str, speech_rate: float = 0.92) -> int:
    clean = clean_text_for_speech(text)
    if not clean:
        return 0

    word_count = len(clean.split())
    base_ms = (word_count * 400) / max(0.5, min(2.0, speech_rate))

    pauses = (
        clean.count(",") * 200
        + clean.count(".") * 350
        + clean.count("!") * 350
        + clean.count("?") * 350
    )
    return int(base_ms + pauses)


# ─────────────────────────────────────────────────────────────────────────────
# Viseme generation
# ─────────────────────────────────────────────────────────────────────────────

def generate_visemes_for_text(
    text: str, speech_rate: float = 0.92
) -> List[Dict[str, Any]]:
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

    for ch in chars:
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

    visemes.append({
        "timeMs": current_time_ms + 100,
        "visemeId": 0,
        "amplitude": 0.0,
        "phoneme": "silence",
    })
    return visemes


# ─────────────────────────────────────────────────────────────────────────────
# edge-tts helpers
# ─────────────────────────────────────────────────────────────────────────────

def _rate_string(speech_rate: float) -> str:
    """0.92 -> '-8%', 1.0 -> '+0%', 1.1 -> '+10%'."""
    rate = max(0.7, min(1.2, float(speech_rate)))
    pct = int(round((rate - 1.0) * 100))
    return f"{pct:+d}%"


async def _synthesize(text: str, voice: str, rate: str):
    try:
        communicate = edge_tts.Communicate(
            text, voice, rate=rate, boundary="WordBoundary"
        )
    except TypeError:
        # older edge-tts versions have no "boundary" argument
        communicate = edge_tts.Communicate(text, voice, rate=rate)

    audio = bytearray()
    boundaries: List[Dict[str, Any]] = []

    async for chunk in communicate.stream():
        kind = chunk.get("type")
        if kind == "audio":
            audio.extend(chunk["data"])
        elif kind in ("WordBoundary", "SentenceBoundary"):
            boundaries.append(chunk)

    return bytes(audio), boundaries


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(asyncio.wait_for(coro, timeout=45))
    finally:
        loop.close()


def _build_alignment(boundaries: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Builds an ElevenLabs-style character alignment from edge-tts timing
    events, so lip-sync code that used ElevenLabs keeps working.
    Times in edge-tts are in 100-nanosecond units.
    """
    characters: List[str] = []
    starts: List[float] = []
    ends: List[float] = []
    prev_end = 0.0

    for b in boundaries:
        word = b.get("text") or ""
        if not word:
            continue

        start = b["offset"] / 10_000_000
        duration = b["duration"] / 10_000_000
        count = len(word)

        if characters:  # the space between words
            characters.append(" ")
            starts.append(prev_end)
            ends.append(start)

        for i, ch in enumerate(word):
            characters.append(ch)
            starts.append(start + duration * i / count)
            ends.append(start + duration * (i + 1) / count)

        prev_end = start + duration

    if not characters:
        return None

    return {
        "characters": characters,
        "character_start_times_seconds": starts,
        "character_end_times_seconds": ends,
    }


# ─────────────────────────────────────────────────────────────────────────────
# TTS service
# ─────────────────────────────────────────────────────────────────────────────

class TTSService:
    """Core Text-to-Speech service for LOLO PAT."""

    @classmethod
    def generate_audio(cls, text: str, speech_rate: float = 0.92) -> Dict[str, Any]:
        voice = os.getenv("EDGE_TTS_VOICE", TTS_VOICE)
        rate = _rate_string(speech_rate)

        key = hashlib.sha256(f"{voice}|{rate}|{text}".encode("utf-8")).hexdigest()
        cache_file = os.path.join(CACHE_DIR, key + ".json")

        # Cache hit: instant
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass  # corrupted cache file, regenerate

        try:
            audio_bytes, boundaries = _run_async(_synthesize(text, voice, rate))
        except Exception as error:
            raise RuntimeError(f"edge-tts failed: {error}") from error

        if not audio_bytes:
            raise RuntimeError("edge-tts returned no audio data.")

        alignment = _build_alignment(boundaries)

        result = {
            "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
            "alignment": alignment,
            "normalizedAlignment": alignment,
        }

        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(result, f)
        except Exception:
            pass  # caching is optional

        return result

    # Old name, kept in case another file still calls it.
    generate_elevenlabs_audio = generate_audio

    @classmethod
    def process_tts_request(
        cls,
        text: str,
        language: str = "fil",
        speech_rate: Optional[float] = None,
        speech_pitch: Optional[float] = None,
    ) -> Dict[str, Any]:
        clean_text = clean_text_for_speech(text)

        if not clean_text:
            return {"success": False, "error": "No text to synthesize."}

        rate = speech_rate if speech_rate is not None else Config.LOLO_TTS_RATE
        pitch = speech_pitch if speech_pitch is not None else Config.LOLO_TTS_PITCH
        lang = language or Config.LOLO_LANGUAGE

        duration_ms = estimate_speech_duration_ms(clean_text, rate)
        visemes = generate_visemes_for_text(clean_text, rate)

        audio_result = cls.generate_audio(clean_text, speech_rate=rate)

        return {
            "success": True,
            "text": clean_text,
            "language": lang,
            "speechRate": rate,
            "speechPitch": pitch,
            "durationMs": duration_ms,
            "visemes": visemes,
            "voiceName": "Microsoft Neural",
            "voiceId": os.getenv("EDGE_TTS_VOICE", TTS_VOICE),
            "audioBase64": audio_result["audioBase64"],
            "alignment": audio_result["alignment"],
            "normalizedAlignment": audio_result["normalizedAlignment"],
        }