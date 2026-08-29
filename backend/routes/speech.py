"""
backend/routes/speech.py
─────────────────────────────────────────────────────────────────────────────
LOLO PAT Speech API Blueprint — Phase 7 (TTS) & Phase 8 (STT).

Endpoints:
  POST /api/lolo/speech/tts   → Text-to-Speech synthesis parameters & viseme data
  GET  /api/lolo/speech/info  → Voice and speech configuration info
─────────────────────────────────────────────────────────────────────────────
"""

from flask import Blueprint, request, jsonify
from services.tts_service import TTSService
from services.stt_service import STTService
from config import Config

lolo_speech_bp = Blueprint("lolo_speech", __name__, url_prefix="/api/lolo/speech")


@lolo_speech_bp.route("/tts", methods=["POST"])
def text_to_speech():
    """
    POST /api/lolo/speech/tts
    Accepts text and returns normalized speech payload and lip-sync visemes.

    Body:
    {
      "text": "Magandang araw po!",
      "language": "fil",
      "speechRate": 0.92,
      "speechPitch": 0.95
    }
    """
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"success": False, "error": "text is required."}), 400

    language = data.get("language") or Config.LOLO_LANGUAGE
    speech_rate = data.get("speechRate")
    speech_pitch = data.get("speechPitch")

    try:
        result = TTSService.process_tts_request(
            text=text,
            language=language,
            speech_rate=float(speech_rate) if speech_rate is not None else None,
            speech_pitch=float(speech_pitch) if speech_pitch is not None else None,
        )
        return jsonify(result), 200
    except Exception as exc:
        print(f"[LOLO SPEECH] Error in TTS: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500


@lolo_speech_bp.route("/stt", methods=["POST"])
def speech_to_text():
    """
    POST /api/lolo/speech/stt
    Transcribes audio recorded from the user's mobile device or web browser.

    Body:
    {
      "audio": "<base64_audio_data>",
      "mimeType": "audio/m4a",
      "language": "fil"
    }
    """
    data = request.get_json(silent=True) or {}
    audio_b64 = data.get("audio") or data.get("audio_b64") or data.get("image_b64")

    if not audio_b64:
        return jsonify({"success": False, "error": "audio (base64) is required."}), 400

    mime_type = data.get("mimeType") or data.get("mime_type") or "audio/m4a"
    language = data.get("language") or Config.LOLO_LANGUAGE

    try:
        result = STTService.transcribe_audio(
            audio_b64=audio_b64,
            mime_type=mime_type,
            language=language,
        )
        status_code = 200 if result.get("success") else 400
        return jsonify(result), status_code
    except Exception as exc:
        print(f"[LOLO SPEECH] Error in STT: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500


@lolo_speech_bp.route("/info", methods=["GET"])
def speech_info():
    """
    GET /api/lolo/speech/info
    Returns supported languages, default pitch/rate, and configuration.
    """
    return jsonify({
        "success": True,
        "defaultLanguage": Config.LOLO_LANGUAGE,
        "supportedLanguages": ["fil-PH", "tl-PH", "en-PH", "en-US"],
        "defaultRate": Config.LOLO_TTS_RATE,
        "defaultPitch": Config.LOLO_TTS_PITCH,
        "features": {
            "tts": True,
            "stt": True,
            "visemes": True,
            "multimodalAudio": bool(Config.GEMINI_API_KEY),
            "androidOptimized": True,
        },
    }), 200

