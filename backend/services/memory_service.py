"""
backend/services/memory_service.py
─────────────────────────────────────────────────────────────────────────────
LOLO AUREA Long-Term Memory Service — Phase 6

Responsibilities:
  - Extract important memories from conversation turns (via Gemini or rules)
  - Store / retrieve / delete memories in Supabase (lolo_memories table)
  - Rank and return memories most relevant to the current message
  - Format memories for system-prompt injection
─────────────────────────────────────────────────────────────────────────────
"""

import json
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from config import Config

# ─── Constants ────────────────────────────────────────────────────────────────

TABLE = "lolo_memories"

MEMORY_PRIORITIES  = {"low", "medium", "high", "critical"}
MEMORY_CATEGORIES  = {"personal", "health", "preference", "event", "conversation", "other"}

PRIORITY_WEIGHT    = {"critical": 4.0, "high": 2.0, "medium": 1.0, "low": 0.5}

# ─── Gemini Extraction Schema ─────────────────────────────────────────────────

_EXTRACTION_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "memories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": (
                            "The specific fact worth remembering, written as a clear, "
                            "standalone statement in Filipino or English."
                        ),
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "critical"],
                        "description": "How important is this memory for future conversations?",
                    },
                    "category": {
                        "type": "string",
                        "enum": ["personal", "health", "preference", "event", "conversation", "other"],
                        "description": "The category this memory belongs to.",
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Confidence score 0.0–1.0 that this is worth storing long-term.",
                    },
                },
                "required": ["content", "priority", "category", "confidence"],
            },
        }
    },
    "required": ["memories"],
}

_EXTRACTION_SYSTEM_PROMPT = """\
You are a memory extraction AI for LOLO AUREA, a senior citizen AI companion.

Your task: Read one conversation turn and extract ONLY facts worth remembering long-term.

WHAT TO EXTRACT:
• Personal: user's full name, age, barangay/address, family members
• Health: medical conditions, medications, allergies, recent check-ups
• Preferences: likes, dislikes, hobbies, food, TV shows
• Events: birthdays, anniversaries, upcoming appointments, deadlines
• Significant requests, concerns, or goals the user expressed

WHAT NOT TO EXTRACT:
• Generic greetings, small talk, thank-yous
• Questions the AI answered (unless they reveal user info)
• Screen navigation actions (opening Digital ID, applying for benefits)
• Information the AI stated (not the user)

PRIORITY GUIDE:
  critical → User's name, life-threatening conditions, emergency contacts
  high     → Key medications, important family members, upcoming appointments
  medium   → Preferences, hobbies, regular habits, interests
  low      → Minor preferences, casual one-time mentions

Return an empty memories array if nothing important was said.
Confidence must be 0.0–1.0. Only include memories with confidence ≥ 0.65.
"""

# ─── Supabase REST Helper ─────────────────────────────────────────────────────

def _supabase(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    payload: dict | list | None = None,
) -> list | dict:
    """Lightweight Supabase REST wrapper (reuses Config credentials)."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase is not configured (missing URL or key).")

    url     = f"{Config.SUPABASE_URL}/rest/v1/{path}"
    headers = Config.supabase_headers(prefer_return=(method.upper() == "POST"))

    try:
        resp = requests.request(
            method.upper(),
            url,
            headers=headers,
            params=params,
            json=payload,
            timeout=10,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Cannot reach Supabase: {exc}") from exc

    if not resp.ok:
        try:
            body   = resp.json()
            detail = body.get("message") or body.get("hint") or body.get("details") or str(body)
        except ValueError:
            detail = resp.text
        raise RuntimeError(f"Supabase error ({resp.status_code}): {detail}")

    return resp.json() if resp.content else []


# ─── Gemini Client ────────────────────────────────────────────────────────────

def _gemini_client():
    """Return a configured Gemini client, or None if no API key."""
    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or ""
    ).strip()

    if not api_key or api_key == "your_gemini_api_key_here":
        return None

    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as exc:
        print(f"[LOLO Memory] Gemini client error: {exc}")
        return None


# ─── Memory Extraction ────────────────────────────────────────────────────────

def extract_and_store_async(
    user_message: str,
    ai_reply: str,
    user_id: int,
    conversation_id: str,
) -> None:
    """
    Launch memory extraction in a background daemon thread.
    Call this AFTER sending the chat response so it doesn't add latency.
    """
    thread = threading.Thread(
        target=_extract_and_store,
        args=(user_message, ai_reply, user_id, conversation_id),
        daemon=True,
        name=f"memory-extract-{user_id}",
    )
    thread.start()


def _extract_and_store(
    user_message: str,
    ai_reply: str,
    user_id: int,
    conversation_id: str,
) -> list[dict]:
    """Internal: extract memories from a turn and persist to Supabase."""
    client = _gemini_client()

    if not client:
        return _rule_based_extract_and_store(user_message, user_id, conversation_id)

    try:
        model = Config.GEMINI_MODEL or "gemini-2.5-flash"
        turn  = f"USER: {user_message}\nAUREA: {ai_reply}"

        response = client.models.generate_content(
            model=model,
            contents=[{"role": "user", "parts": [{"text": turn}]}],
            config={
                "system_instruction": _EXTRACTION_SYSTEM_PROMPT,
                "temperature":        0.2,
                "max_output_tokens":  400,
                "response_mime_type": "application/json",
                "response_schema":    _EXTRACTION_SCHEMA,
            },
        )

        parsed     = json.loads(response.text or "{}")
        candidates = parsed.get("memories", [])
        threshold  = Config.LOLO_MEMORY_EXTRACTION_THRESHOLD

        stored = []
        for mem in candidates:
            confidence = float(mem.get("confidence", 0.0))
            if confidence < threshold:
                continue

            content  = str(mem.get("content", "")).strip()
            priority = str(mem.get("priority", "medium")).lower()
            category = str(mem.get("category", "other")).lower()

            if not content:
                continue
            if priority not in MEMORY_PRIORITIES:
                priority = "medium"
            if category not in MEMORY_CATEGORIES:
                category = "other"

            result = store_memory(user_id, content, priority, category, conversation_id)
            if result:
                stored.append(result)

        if stored:
            print(f"[LOLO Memory] Stored {len(stored)} new memories for user {user_id}")

        return stored

    except json.JSONDecodeError as exc:
        print(f"[LOLO Memory] JSON parse error: {exc}")
        return []
    except Exception as exc:
        print(f"[LOLO Memory] Extraction error: {exc}")
        return []


# ─── Rule-Based Extraction (Fallback) ─────────────────────────────────────────

_RULE_PATTERNS: list[tuple[str, str, str]] = [
    # (regex, category, priority)
    (r"(?:ang pangalan ko|ako si|tawag sa akin|my name is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", "personal", "critical"),
    (r"(?:nakatira|naninirahan|taga|from)\s+(?:sa\s+)?(?:barangay\s+)?([A-Za-z][a-zA-Z\s]{2,25}?)(?:\s+po|\s+ako|\.|,|$)", "personal", "high"),
    (r"(?:may sakit|may karamdaman|na-diagnose|i have|suffering from)\s+(.{4,60}?)(?:\.|,|!|\n|$)", "health", "high"),
    (r"(?:umiinom ng|nag-iinom ng|taking|my medicine is|gamot ko)\s+(.{4,60}?)(?:\.|,|!|\n|$)", "health", "high"),
    (r"(?:birthday ko|kaarawan ko|my birthday)\s+(?:is\s+|ay\s+)?(.{4,40}?)(?:\.|,|!|\n|$)", "event", "high"),
    (r"(?:paborito ko|gusto ko|i love|i like|mahilig ako sa)\s+(.{4,60}?)(?:\.|,|!|\n|$)", "preference", "medium"),
]


def _rule_based_extract_and_store(
    user_message: str,
    user_id: int,
    conversation_id: str,
) -> list[dict]:
    """Regex-based fallback when Gemini is not configured."""
    stored = []
    for pattern, category, priority in _RULE_PATTERNS:
        match = re.search(pattern, user_message, re.IGNORECASE)
        if match:
            content = match.group(1).strip()
            if len(content) > 3:
                result = store_memory(user_id, content, priority, category, conversation_id)
                if result:
                    stored.append(result)
    return stored


# ─── CRUD ─────────────────────────────────────────────────────────────────────

def store_memory(
    user_id: int,
    content: str,
    priority: str = "medium",
    category: str = "other",
    conversation_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Persist a new memory to Supabase.
    Returns the created memory row, or None on error.
    """
    try:
        rows = _supabase(
            "POST",
            TABLE,
            payload={
                "user_id":                user_id,
                "content":                content[:500],   # hard cap
                "priority":               priority,
                "category":               category,
                "source_conversation_id": conversation_id,
                "created_at":             datetime.now(timezone.utc).isoformat(),
            },
        )
        return rows[0] if isinstance(rows, list) and rows else None
    except Exception as exc:
        print(f"[LOLO Memory] store_memory error: {exc}")
        return None


def get_memories(user_id: int, limit: int = 50) -> list[dict]:
    """
    Retrieve all memories for a user, newest first.
    Returns empty list on any error (graceful degradation).
    """
    try:
        rows = _supabase(
            "GET",
            TABLE,
            params={
                "user_id": f"eq.{user_id}",
                "select":  "*",
                "order":   "created_at.desc",
                "limit":   str(limit),
            },
        )
        return rows if isinstance(rows, list) else []
    except Exception as exc:
        print(f"[LOLO Memory] get_memories error: {exc}")
        return []


def get_relevant_memories(
    user_id: int,
    message: str,
    limit: int = 8,
) -> list[dict]:
    """
    Fetch the most relevant memories for the current message.

    Algorithm:
      1. Retrieve all memories (capped at 100)
      2. Score each by keyword overlap with the current message
      3. Apply priority boost multipliers
      4. Always include all 'critical' memories
      5. Return top `limit` results
    """
    all_memories = get_memories(user_id, limit=100)
    if not all_memories:
        return []

    msg_tokens = set(re.findall(r"\b\w{3,}\b", message.lower()))

    scored = []
    for mem in all_memories:
        mem_tokens = set(re.findall(r"\b\w{3,}\b", mem.get("content", "").lower()))
        overlap    = len(msg_tokens & mem_tokens)
        boost      = PRIORITY_WEIGHT.get(mem.get("priority", "low"), 0.5)
        scored.append((overlap * boost + boost * 0.1, mem))

    # Sort highest score first; critical memories always rise to top
    scored.sort(key=lambda x: (
        -(x[1].get("priority") == "critical"),  # critical first
        -x[0],                                   # then score
    ))

    top = [m for _, m in scored][:limit]

    # Fire-and-forget: update last_accessed_at in background
    ids = [m["id"] for m in top if m.get("id")]
    if ids:
        threading.Thread(
            target=_update_last_accessed, args=(ids,), daemon=True
        ).start()

    return top


def delete_memory(memory_id: str) -> bool:
    """Delete a single memory. Returns True on success."""
    try:
        _supabase("DELETE", TABLE, params={"id": f"eq.{memory_id}"})
        return True
    except Exception as exc:
        print(f"[LOLO Memory] delete_memory error: {exc}")
        return False


def delete_all_memories(user_id: int) -> bool:
    """Delete ALL memories for a user. Returns True on success."""
    try:
        _supabase("DELETE", TABLE, params={"user_id": f"eq.{user_id}"})
        return True
    except Exception as exc:
        print(f"[LOLO Memory] delete_all_memories error: {exc}")
        return False


def _update_last_accessed(memory_ids: list[str]) -> None:
    """Update last_accessed_at timestamp for a batch of memories (fire-and-forget)."""
    now = datetime.now(timezone.utc).isoformat()
    for mid in memory_ids:
        try:
            _supabase(
                "PATCH",
                TABLE,
                params={"id": f"eq.{mid}"},
                payload={"last_accessed_at": now},
            )
        except Exception:
            pass


# ─── Prompt Injection ─────────────────────────────────────────────────────────

_CATEGORY_LABELS = {
    "personal":     "PERSONAL",
    "health":       "KALUSUGAN",
    "preference":   "GUSTO",
    "event":        "KAGANAPAN",
    "conversation": "NABANGGIT",
    "other":        "IBA PA",
}


def format_memories_for_prompt(memories: list[dict]) -> str:
    """
    Render memories into a compact block for injection into the system prompt.

    Example:
        ── ALAALA NG USER ───────────────────────────────────────────────────
        [PERSONAL] Pangalan ng user: Maria Santos
        [KALUSUGAN] Umiinom ng maintenance medicine para sa hypertension
        [GUSTO] Mahilig sa balut at kwentuhan tungkol sa Pateros
    """
    if not memories:
        return ""

    lines = [
        "\n── ALAALA NG USER ───────────────────────────────────────────────────",
        "Gamitin ang mga sumusunod na impormasyon nang natural sa diyalogo:",
    ]
    for mem in memories:
        label   = _CATEGORY_LABELS.get(mem.get("category", "other"), "ALAALA")
        content = mem.get("content", "").strip()
        if content:
            lines.append(f"[{label}] {content}")

    lines.append("────────────────────────────────────────────────────────────────────")
    return "\n".join(lines)
