"""
backend/routes/__init__.py
─────────────────────────────────────────────────────────────────────────────
Routes package for the AUREA Flask backend.

Call register_lolo_routes(app) in app.py after creating the Flask instance.
─────────────────────────────────────────────────────────────────────────────
"""

from flask import Flask


def register_lolo_routes(app: Flask) -> None:
    """
    Register all LOLO AUREA route blueprints on the Flask app.
    Blueprints are imported here (not at module level) to avoid circular imports.
    """

    # ── Phase 2: Chat + Health ────────────────────────────────────────────────
    from routes.chat import lolo_chat_bp
    app.register_blueprint(lolo_chat_bp)
    print("[LOLO] Registered blueprint: /api/lolo/chat, /api/lolo/health")

    # ── Phase 6: Memory ───────────────────────────────────────────────────────
    from routes.memory import lolo_memory_bp
    app.register_blueprint(lolo_memory_bp)
    print("[LOLO] Registered blueprint: /api/lolo/memory")

    # ── Phase 7–8: Speech (TTS / STT) ────────────────────────────────────────
    from routes.speech import lolo_speech_bp
    app.register_blueprint(lolo_speech_bp)
    print("[LOLO] Registered blueprint: /api/lolo/speech")

    # ── Phase 11: Avatar Emotion ──────────────────────────────────────────────
    from routes.avatar import lolo_avatar_bp
    app.register_blueprint(lolo_avatar_bp)
    print("[LOLO] Registered blueprint: /api/lolo/avatar")
