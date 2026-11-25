"""
backend/services/stt_service.py
─────────────────────────────────────────────────────────────────────────────
Speech-to-Text service using Groq Whisper.

Groq's whisper-large-v3-turbo is fast, accurate for Filipino/Taglish,
and free on the Groq API (https://console.groq.com).
─────────────────────────────────────────────────────────────────────────────
"""

import base64
import io
import tempfile
import os
from typing import Dict, Any
from config import Config

_groq_client = None


def _get_groq_client():
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    if not Config.GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        _groq_client = Groq(api_key=Config.GROQ_API_KEY)
        return _groq_client
    except Exception as exc:
        print(f"[LOLO STT] Failed to initialize Groq client: {exc}")
        return None


class STTService:

    @staticmethod
    def transcribe_audio(
        audio_b64: str,
        mime_type: str = "audio/m4a",
        language: str = "fil",
    ) -> Dict[str, Any]:
        if not audio_b64:
            return {"success": False, "error": "audio_b64 is required."}

        # Strip data URL prefix if present
        if "," in audio_b64:
            audio_b64 = audio_b64.split(",", 1)[1]

        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as exc:
            return {"success": False, "error": f"Invalid base64 audio: {exc}"}

        if len(audio_bytes) < 100:
            return {"success": False, "error": "Audio recording is too short or empty."}

        client = _get_groq_client()
        if not client:
            return {"success": False, "error": "stt_unavailable", "text": ""}

        # Groq Whisper accepts a file-like object; write bytes to a temp file
        # so we can pass a named file with the correct extension.
        ext = "m4a"
        if "wav" in mime_type:
            ext = "wav"
        elif "mp3" in mime_type or "mpeg" in mime_type:
            ext = "mp3"
        elif "webm" in mime_type:
            ext = "webm"
        elif "ogg" in mime_type:
            ext = "ogg"
        elif "flac" in mime_type:
            ext = "flac"

        # Groq expects language as a 2-letter ISO code
        iso_lang = "tl" if language in ("fil", "fil-PH", "tl-PH", "tl") else "en"

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            with open(tmp_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model=Config.GROQ_STT_MODEL,
                    file=(f"audio.{ext}", audio_file, mime_type),
                    language=iso_lang,
                    response_format="text",
                )

            text = (transcription if isinstance(transcription, str) else str(transcription)).strip()

            if not text or len(text) < 2:
                return {"success": False, "text": "", "error": "no_speech", "language": language}

            return {
                "success": True,
                "text": text,
                "confidence": 0.95,
                "language": language,
                "source": "groq_whisper",
            }

        except Exception as exc:
            err_str = str(exc)
            if "429" in err_str or "rate_limit" in err_str.lower():
                print(f"[LOLO STT] Groq rate limit hit.")
                return {"success": False, "text": "", "error": "quota_exceeded", "language": language}
            print(f"[LOLO STT] Groq transcription error: {exc}")
            return {"success": False, "text": "", "error": str(exc), "language": language}

        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
