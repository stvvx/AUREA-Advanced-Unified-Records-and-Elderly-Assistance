"""
config.py
─────────────────────────────────────────────────────────────────────────────
Centralized configuration for the AUREA backend.

All environment variables are read here. Other modules import from this file
instead of calling os.environ.get() directly.

Usage:
    from config import Config
    print(Config.FLASK_PORT)
─────────────────────────────────────────────────────────────────────────────
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env file from the same directory as this config file
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


class Config:
    """
    Static configuration class.
    All values are read from environment variables with sensible defaults.
    """

    # ── Flask ────────────────────────────────────────────────────────────────
    FLASK_PORT: int = int(os.environ.get("PORT", "5000"))
    FLASK_DEBUG: bool = os.environ.get("NODE_ENV", "production") == "development"
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "aurea-lolo-secret-change-me")

    # ── Supabase ─────────────────────────────────────────────────────────────
    SUPABASE_URL: str = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    ).strip().rstrip("/")

    SUPABASE_SERVICE_ROLE_KEY: str = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    ).strip()

    SUPABASE_USERS_TABLE: str = (
        os.environ.get("SUPABASE_USERS_TABLE", "users").strip() or "users"
    )

    SUPABASE_STORAGE_BUCKET: str = (
        os.environ.get("SUPABASE_STORAGE_BUCKET", "avatars").strip() or "avatars"
    )

    # ── AI / Gemini ───────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "").strip()

    # The Gemini model to use for LOLO AUREA conversations.
    # gemini-1.5-flash is fast and cost-effective for real-time chat.
    GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

    # ── LOLO AUREA Conversation Settings ─────────────────────────────────────

    # Maximum number of past messages to include in each AI prompt.
    # Higher = better context but more tokens used.
    LOLO_CONVERSATION_HISTORY_LIMIT: int = int(
        os.environ.get("LOLO_CONVERSATION_HISTORY_LIMIT", "20")
    )

    # Maximum number of long-term memory entries to inject per conversation.
    LOLO_MAX_MEMORY_INJECT: int = int(
        os.environ.get("LOLO_MAX_MEMORY_INJECT", "10")
    )

    # Maximum total memory entries stored per user (oldest get pruned).
    LOLO_MAX_MEMORY_ENTRIES: int = int(
        os.environ.get("LOLO_MAX_MEMORY_ENTRIES", "100")
    )

    # Minimum confidence threshold (0.0–1.0) for memory extraction.
    LOLO_MEMORY_EXTRACTION_THRESHOLD: float = float(
        os.environ.get("LOLO_MEMORY_EXTRACTION_THRESHOLD", "0.7")
    )

    # ── LOLO AUREA Voice Settings ─────────────────────────────────────────────

    # Default language for LOLO AUREA (BCP 47).
    # 'fil-PH' = Filipino/Tagalog, 'en-PH' = English (Philippine)
    LOLO_DEFAULT_LANGUAGE: str = os.environ.get("LOLO_DEFAULT_LANGUAGE", "fil-PH")

    # Default TTS speech rate (1.0 = normal).
    LOLO_TTS_RATE: float = float(os.environ.get("LOLO_TTS_RATE", "0.93"))

    # Default TTS pitch (1.0 = normal).
    LOLO_TTS_PITCH: float = float(os.environ.get("LOLO_TTS_PITCH", "0.95"))

    # ── CORS ─────────────────────────────────────────────────────────────────

    # Allowed origins for CORS (comma-separated). Default: all.
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "*").split(",")
        if o.strip()
    ]

    # ── Supabase REST Headers ─────────────────────────────────────────────────

    @classmethod
    def supabase_headers(cls, *, prefer_return: bool = False) -> dict:
        """
        Returns the standard Supabase REST API headers.

        NOTE: The sb_secret_... key must be passed as 'apikey', NOT as
        'Authorization: Bearer' (which causes 'JWT could not be decoded').
        """
        headers: dict = {
            "apikey": cls.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        if prefer_return:
            headers["Prefer"] = "return=representation"
        return headers

    @classmethod
    def validate(cls) -> list[str]:
        """
        Validates that required environment variables are set.
        Returns a list of warning messages for any missing values.
        Call this at application startup.
        """
        warnings: list[str] = []

        if not cls.SUPABASE_URL:
            warnings.append("WARNING: SUPABASE_URL is not set.")

        if not cls.SUPABASE_SERVICE_ROLE_KEY:
            warnings.append("WARNING: SUPABASE_SERVICE_ROLE_KEY is not set.")

        if not cls.GEMINI_API_KEY:
            warnings.append(
                "WARNING: GEMINI_API_KEY is not set. "
                "LOLO AUREA will use fallback rule-based responses only."
            )

        return warnings
