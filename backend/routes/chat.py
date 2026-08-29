"""
backend/routes/chat.py
─────────────────────────────────────────────────────────────────────────────
LOLO AUREA Chat Blueprint

Phase 6 Upgrades:
  - Fetches relevant memories before generating AI response
  - Injects memories into the system prompt via assistant_service
  - Triggers async memory extraction after each reply (zero latency impact)
  - Health endpoint updated to reflect Phase 6 capabilities

Endpoints:
  POST /api/lolo/chat    → Send a message, get AI response + emotion
  GET  /api/lolo/health  → LOLO-specific health check
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from config import Config
import assistant_service

# ─── Blueprint ────────────────────────────────────────────────────────────────

lolo_chat_bp = Blueprint("lolo_chat", __name__, url_prefix="/api/lolo")

# ─── Valid Emotion Set ────────────────────────────────────────────────────────

_VALID_EMOTIONS = set(assistant_service.SUPPORTED_EMOTIONS)

# ─── Safety Fallback: Keyword Emotion Detection ───────────────────────────────

_EMOTION_KEYWORDS: list[tuple[list[str], str]] = [
    (["masaya", "maligaya", "wonderful", "great", "maganda", "mabuti", "happy", "congratulations", "binabati"], "happy"),
    (["sobrang", "wow", "kamangha-mangha", "incredible", "amazing", "excited", "napakasaya", "!!"], "excited"),
    (["nalulungkot", "sorry", "pasensya", "naiintindihan", "kawawa", "sad", "patawad"], "sad"),
    (["hmm", "tingnan", "pag-isipan", "let me think", "siguro", "baka", "thinking"], "thinking"),
    (["talaga", "ay naku", "grabe", "hindi ko alam", "surprised", "nagulat"], "surprised"),
    (["antok", "pahinga", "matulog", "magpahinga", "rest", "sleepy", "pagod"], "sleepy"),
]

_GREETING_PATTERNS = [
    "magandang", "kumusta", "kamusta", "hello", "hi",
    "good morning", "good afternoon", "good evening",
]


def _detect_emotion(text: str) -> str:
    """Last-resort keyword emotion detection (used only when AI doesn't return valid emotion)."""
    lower = text.lower()
    if any(g in lower for g in _GREETING_PATTERNS) and len(text) < 200:
        return "happy"
    for keywords, emotion in _EMOTION_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return emotion
    return "neutral"


def _extract_action(text: str):
    """Extract [ACTION:TAG] from plain-text (legacy safety)."""
    import re
    match = re.search(r"\[ACTION:([A-Z_]+)\]", text)
    return match.group(1) if match else None


# ─── POST /api/lolo/chat ─────────────────────────────────────────────────────

@lolo_chat_bp.route("/chat", methods=["POST", "OPTIONS"])
def lolo_chat():
    """
    Main LOLO AUREA chat endpoint.

    Phase 6 flow:
      1. Validate request
      2. Fetch relevant memories from Supabase
      3. Generate AI response (memories injected into system prompt)
      4. Return response immediately
      5. Extract new memories in background thread (no latency)

    Request JSON:
        {
            "userId":         123,
            "message":        "Kumusta Lolo",
            "conversationId": "uuid",           // optional
            "language":       "fil",            // optional
            "history":        [...],            // optional
            "userProfile":    { ... }           // optional
        }

    Response JSON:
        {
            "success":        true,
            "message":        "Magandang araw po!",
            "emotion":        "happy",
            "conversationId": "uuid",
            "action":         null,
            "source":         "gemini"
        }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    # ── Validate ───────────────────────────────────────────────────────────────
    user_id_raw = data.get("userId")
    message: str = str(data.get("message") or data.get("text") or "").strip()

    if not user_id_raw:
        return jsonify({"success": False, "error": "userId is required."}), 400

    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "userId must be an integer."}), 400

    if not message:
        return jsonify({
            "success": True,
            "message": (
                "Kumusta po kayo! Ako po si Lolo Pat. "
                "Ano po ang maipaglilingkod ko sa inyo ngayon?"
            ),
            "emotion":        "happy",
            "conversationId": data.get("conversationId") or str(uuid.uuid4()),
            "action":         None,
            "source":         "companion_default",
        }), 200

    # ── Build context ──────────────────────────────────────────────────────────
    conversation_id: str = data.get("conversationId") or str(uuid.uuid4())
    language: str = data.get("language", "fil")

    history: list[dict] = data.get("history") or []
    history = history[-(Config.LOLO_CONVERSATION_HISTORY_LIMIT):]

    user_profile: dict = data.get("userProfile") or data.get("user_profile") or {}

    print(
        f"[LOLO AUREA] Chat | user={user_id} | conv={conversation_id[:8]}… "
        f"| lang={language} | msg_len={len(message)}"
    )

    # ── Phase 6: Fetch relevant memories ─────────────────────────────────────
    memories: list[dict] = []
    try:
        from services.memory_service import get_relevant_memories
        memories = get_relevant_memories(user_id, message, limit=Config.LOLO_MAX_MEMORY_INJECT)
        if memories:
            print(f"[LOLO Memory] Injecting {len(memories)} memories for user {user_id}")
    except Exception as mem_exc:
        # Table may not exist yet — chat still works fine without memories
        print(f"[LOLO Memory] Could not fetch memories (is the table created?): {mem_exc}")

    # ── Generate AI Response ───────────────────────────────────────────────────
    try:
        result = assistant_service.generate_assistant_response(
            message=message,
            history=history,
            user_profile=user_profile,
            memories=memories,          # Phase 6: pass memories to AI
        )

        reply_text: str = result.get("text") or result.get("message") or ""
        source: str     = result.get("source", "companion_default")

        # Emotion: prefer AI-provided, fall back to keyword detection
        ai_emotion: str = result.get("emotion", "")
        emotion: str = (
            ai_emotion if ai_emotion in _VALID_EMOTIONS
            else _detect_emotion(reply_text)
        )

        # Action: prefer AI-provided, fall back to text extraction
        action: str | None = result.get("action") or _extract_action(reply_text)

        print(
            f"[LOLO AUREA] Reply | source={source} | emotion={emotion} "
            f"| action={action} | chars={len(reply_text)} | memories_used={len(memories)}"
        )

        # ── Phase 6: Extract memories in background (no latency) ──────────────
        try:
            from services.memory_service import extract_and_store_async
            extract_and_store_async(message, reply_text, user_id, conversation_id)
        except Exception as ext_exc:
            print(f"[LOLO Memory] Could not start extraction thread: {ext_exc}")

        return jsonify({
            "success":        True,
            "message":        reply_text,
            "emotion":        emotion,
            "conversationId": conversation_id,
            "action":         action,
            "source":         source,
        }), 200

    except Exception as exc:
        print(f"[LOLO AUREA] Chat error: {exc}")
        return jsonify({
            "success":        True,
            "message": (
                "Nandito po ako, kaibigang senior citizen! "
                "Paumanhin at may maliit na abala ngayon. "
                "Pakisubukang muli po."
            ),
            "emotion":        "sad",
            "conversationId": conversation_id,
            "action":         None,
            "source":         "error_fallback",
        }), 200


# ─── GET /api/lolo/health ─────────────────────────────────────────────────────

@lolo_chat_bp.route("/health", methods=["GET"])
def lolo_health():
    """LOLO AUREA health check — returns AI readiness, features, and timestamp."""
    gemini_key        = Config.GEMINI_API_KEY
    gemini_configured = bool(
        gemini_key
        and gemini_key.strip()
        and gemini_key != "your_gemini_api_key_here"
    )

    # Check if memory table exists (graceful probe)
    memory_ready = False
    try:
        from services.memory_service import _supabase
        _supabase("GET", "lolo_memories", params={"select": "id", "limit": "1"})
        memory_ready = True
    except Exception:
        pass

    return jsonify({
        "status":  "ok",
        "service": "LOLO AUREA AI Companion",
        "version": "0.6.0",  # Phase 6
        "ai": {
            "geminiConfigured": gemini_configured,
            "model":            Config.GEMINI_MODEL if gemini_configured else "knowledge_engine",
            "mode":             "gemini" if gemini_configured else "knowledge_engine",
            "structuredOutput": gemini_configured,
            "emotionSource":    "gemini" if gemini_configured else "knowledge_engine",
        },
        "features": {
            "chat":         True,
            "structuredAI": gemini_configured,
            "memory":       memory_ready,     # Phase 6 ✅
            "voice":        False,            # Phase 7–8
            "avatar":       False,            # Phase 9
            "lipSync":      False,            # Phase 12
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }), 200
