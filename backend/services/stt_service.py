"""
backend/services/stt_service.py
─────────────────────────────────────────────────────────────────────────────
Speech-to-Text (STT) Service for LOLO PAT AI Companion — Phase 8.

Transcribes spoken Filipino/Tagalog and English audio using Gemini Multimodal
Audio processing.
─────────────────────────────────────────────────────────────────────────────
"""

import base64
import io
import re
from typing import Dict, Any, Optional
from config import Config

# Optional Gemini client
_genai_client = None


def _get_gemini_client():
    global _genai_client
    if _genai_client is not None:
        return _genai_client

    if not Config.GEMINI_API_KEY:
        return None

    try:
        from google import genai
        _genai_client = genai.Client(api_key=Config.GEMINI_API_KEY)
        return _genai_client
    except Exception as exc:
        print(f"[LOLO STT] Failed to initialize Gemini client: {exc}")
        return None


class STTService:
    """Core Speech-to-Text service for LOLO PAT."""

    @staticmethod
    def transcribe_audio(
        audio_b64: str,
        mime_type: str = "audio/m4a",
        language: str = "fil",
    ) -> Dict[str, Any]:
        """
        Transcribes base64-encoded audio.
        Supports: audio/m4a, audio/mp4, audio/wav, audio/mp3, audio/webm, audio/aac.
        """
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

        client = _get_gemini_client()

        if client:
            try:
                from google.genai import types

                # CHANGED (1): the prompt now lets Gemini say "no speech"
                prompt = (
                    "You are a precise Speech-to-Text AI for the AUREA app. "
                    "The speaker is an elderly Filipino speaking Tagalog, Filipino, Taglish, or English. "
                    "Transcribe verbatim with proper punctuation and spelling. "
                    "If there is no clearly intelligible human speech (silence, noise, coughing, "
                    "TV or background sounds), output exactly: [NO_SPEECH]. "
                    "Output ONLY the transcription, nothing else."
                )

                normalized_mime = mime_type or "audio/m4a"
                if "m4a" in normalized_mime:
                    normalized_mime = "audio/mp4"

                response = client.models.generate_content(
                    model=Config.GEMINI_MODEL,
                    contents=[
                        types.Part.from_bytes(
                            data=audio_bytes,
                            mime_type=normalized_mime,
                        ),
                        prompt,
                    ],
                )

                transcribed_text = (response.text or "").strip()
                transcribed_text = re.sub(r"^```[a-zA-Z]*\n?", "", transcribed_text)
                transcribed_text = re.sub(r"\n?```$", "", transcribed_text).strip(' "\'')

                # CHANGED (2): treat "no speech" as an empty result
                if "NO_SPEECH" in transcribed_text.upper() or len(transcribed_text) < 2:
                    return {
                        "success": False,
                        "text": "",
                        "error": "no_speech",
                        "language": language,
                    }

                return {
                    "success": True,
                    "text": transcribed_text,
                    "confidence": 0.98,
                    "language": language,
                    "source": "gemini_multimodal_stt",
                }
            except Exception as exc:
                print(f"[LOLO STT] Gemini audio transcription error: {exc}")

        # CHANGED (3): the fake "Magandang araw po Lolo Aurea!..." fallback is gone.
        # If Gemini is unavailable or failed, report failure instead of inventing text.
        return {
            "success": False,
            "text": "",
            "error": "stt_unavailable",
            "language": language,
        }