"""
backend/routes/avatar.py
─────────────────────────────────────────────────────────────────────────────
LOLO PAT Avatar Emotion & Expression API Blueprint — Phase 11.

Endpoints:
  POST /api/lolo/avatar/emotion  → Resolves 3D blendshape expression offsets for an emotion
  GET  /api/lolo/avatar/emotions → List all supported emotional states & metadata
─────────────────────────────────────────────────────────────────────────────
"""

from flask import Blueprint, request, jsonify

lolo_avatar_bp = Blueprint("lolo_avatar", __name__, url_prefix="/api/lolo/avatar")

# 3D Facial Expression & Posture Targets per Emotion
EMOTION_EXPRESSION_PRESETS = {
    "neutral": {
        "eyebrowAngle": 0.0,
        "eyebrowHeight": 0.0,
        "smileCurvature": 0.0,
        "eyeOpenness": 1.0,
        "headTilt": 0.0,
        "headPitch": 0.0,
        "gesture": "idle",
        "description": "Kalmado at natural na tindig",
    },
    "happy": {
        "eyebrowAngle": -0.05,
        "eyebrowHeight": 0.04,
        "smileCurvature": 0.35,
        "eyeOpenness": 0.92,  # Warm crinkle
        "headTilt": 0.04,
        "headPitch": 0.02,
        "gesture": "gentle_nod",
        "description": "Magiliw na ngiti at maaliwalas na mukha",
    },
    "excited": {
        "eyebrowAngle": -0.12,
        "eyebrowHeight": 0.08,
        "smileCurvature": 0.55,
        "eyeOpenness": 1.2,  # Wide attentive eyes
        "headTilt": 0.08,
        "headPitch": 0.05,
        "gesture": "animated_wave",
        "description": "Masiglang pagbati at masayang galaw",
    },
    "sad": {
        "eyebrowAngle": 0.15,  # Inner brow raised
        "eyebrowHeight": -0.02,
        "smileCurvature": -0.25,  # Slight frown / empathy
        "eyeOpenness": 0.8,
        "headTilt": -0.04,
        "headPitch": -0.06,  # Gentle head drop
        "gesture": "somber_idle",
        "description": "May malasakit at nakikiramay na anyo",
    },
    "thinking": {
        "eyebrowAngle": 0.08,
        "eyebrowHeight": 0.03,
        "smileCurvature": -0.05,
        "eyeOpenness": 0.85,
        "headTilt": 0.12,  # Inquisitive head tilt
        "headPitch": 0.04,
        "gesture": "hand_to_chin",
        "description": "Nag-iisip at sumusuri nang mabuti",
    },
    "surprised": {
        "eyebrowAngle": -0.18,
        "eyebrowHeight": 0.12,
        "smileCurvature": 0.1,
        "eyeOpenness": 1.35,  # Very wide eyes
        "headTilt": -0.02,
        "headPitch": 0.08,
        "gesture": "slight_recoil",
        "description": "Nagulat at namangha",
    },
    "sleepy": {
        "eyebrowAngle": 0.02,
        "eyebrowHeight": -0.04,
        "smileCurvature": 0.05,
        "eyeOpenness": 0.45,  # Droopy eyelids
        "headTilt": 0.06,
        "headPitch": -0.08,  # Sleepy head bob
        "gesture": "slow_breathe",
        "description": "Inaantok at nagpapahinga",
    },
}


@lolo_avatar_bp.route("/emotion", methods=["POST"])
def resolve_avatar_emotion():
    """
    POST /api/lolo/avatar/emotion
    Body: { "emotion": "happy" }
    """
    data = request.get_json(silent=True) or {}
    emotion = (data.get("emotion") or "neutral").lower().strip()

    preset = EMOTION_EXPRESSION_PRESETS.get(emotion, EMOTION_EXPRESSION_PRESETS["neutral"])

    return jsonify({
        "success": True,
        "emotion": emotion,
        "preset": preset,
    }), 200


@lolo_avatar_bp.route("/emotions", methods=["GET"])
def list_avatar_emotions():
    """
    GET /api/lolo/avatar/emotions
    """
    return jsonify({
        "success": True,
        "emotions": list(EMOTION_EXPRESSION_PRESETS.keys()),
        "presets": EMOTION_EXPRESSION_PRESETS,
    }), 200
