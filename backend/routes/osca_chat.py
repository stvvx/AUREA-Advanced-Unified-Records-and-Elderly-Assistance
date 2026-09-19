"""
backend/routes/osca_chat.py
─────────────────────────────────────────────────────────────────────────────
OSCA Real-Time Chat Blueprint
Connects Senior Citizens with OSCA Administrators for live inquiries,
support, follow-ups, and municipal announcements.

Features:
  - Connects with Supabase `osca_chat_messages` table.
  - Automatically falls back to a persistent local SQLite store if
    the Supabase table has not been created yet in the SQL Editor.
  - Live unread message tracking and instant background read receipt updating.

Endpoints:
  GET  /api/chat/messages      → Fetch conversation for a senior citizen thread
  POST /api/chat/messages      → Send message from user or OSCA admin
  GET  /api/chat/threads       → List senior citizen conversation threads (Admin)
  GET  /api/chat/unread-count  → Fetch badge count of unread messages
─────────────────────────────────────────────────────────────────────────────
"""

from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import uuid
from flask import Blueprint, jsonify, request
import requests

from config import Config
from services.memory_service import _supabase

osca_chat_bp = Blueprint("osca_chat", __name__, url_prefix="/api/chat")

TABLE_NAME = "osca_chat_messages"
DB_PATH = Path(__file__).resolve().parent.parent / "osca_chat.db"


def _get_local_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_local_db():
    with _get_local_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS osca_chat_messages (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                sender_id INTEGER NOT NULL,
                sender_role TEXT NOT NULL DEFAULT 'user',
                sender_name TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_local_chat_user ON osca_chat_messages(user_id, created_at)")
        conn.commit()


# Initialize on import
_init_local_db()


def _serialize_message(row: dict | sqlite3.Row) -> dict:
    if isinstance(row, sqlite3.Row):
        row = dict(row)
    return {
        "id": str(row.get("id")),
        "userId": row.get("user_id"),
        "senderId": row.get("sender_id"),
        "senderRole": row.get("sender_role") or "user",
        "senderName": row.get("sender_name") or "",
        "message": row.get("message") or "",
        "read": bool(row.get("read")),
        "createdAt": row.get("created_at") or "",
    }


def _mark_as_read(user_id: int, sender_role_condition: str):
    """Marks messages as read in Supabase or local DB in background."""
    try:
        url = f"{Config.SUPABASE_URL}/rest/v1/{TABLE_NAME}"
        headers = Config.supabase_headers()
        params = {
            "user_id": f"eq.{user_id}",
            "read": "eq.false",
        }
        if sender_role_condition == "admin_inbound":
            params["sender_role"] = "eq.user"
        else:
            params["sender_role"] = "neq.user"

        res = requests.patch(url, headers=headers, params=params, json={"read": True}, timeout=4)
        if res.ok:
            return
    except Exception:
        pass

    # Fallback to local DB
    try:
        with _get_local_db() as conn:
            if sender_role_condition == "admin_inbound":
                conn.execute(
                    "UPDATE osca_chat_messages SET read = 1 WHERE user_id = ? AND sender_role = 'user' AND read = 0",
                    (user_id,),
                )
            else:
                conn.execute(
                    "UPDATE osca_chat_messages SET read = 1 WHERE user_id = ? AND sender_role != 'user' AND read = 0",
                    (user_id,),
                )
            conn.commit()
    except Exception:
        pass


@osca_chat_bp.route("/messages", methods=["GET", "POST", "OPTIONS"])
def messages():
    if request.method == "OPTIONS":
        return ("", 204)

    # ── GET: Fetch messages for a specific user thread ──────────────────────
    if request.method == "GET":
        user_id_raw = request.args.get("userId")
        if not user_id_raw:
            return jsonify({"message": "userId query parameter is required."}), 400

        try:
            user_id = int(user_id_raw)
        except ValueError:
            return jsonify({"message": "Invalid userId."}), 400

        reader_role = (request.args.get("readerRole") or "user").strip().lower()

        # Try Supabase first
        data = None
        try:
            rows = _supabase(
                "GET",
                TABLE_NAME,
                params={
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.asc",
                    "select": "*",
                },
            )
            if isinstance(rows, list):
                data = [_serialize_message(r) for r in rows]
        except Exception:
            data = None

        # Fallback to local SQLite if Supabase table is not yet created
        if data is None:
            with _get_local_db() as conn:
                cursor = conn.execute(
                    "SELECT * FROM osca_chat_messages WHERE user_id = ? ORDER BY created_at ASC",
                    (user_id,),
                )
                data = [_serialize_message(r) for r in cursor.fetchall()]

        # Trigger background read receipt marking
        if reader_role in ("osca admin", "super admin", "admin"):
            _mark_as_read(user_id, "admin_inbound")
        else:
            _mark_as_read(user_id, "user_inbound")

        return jsonify({"messages": data}), 200

    # ── POST: Send a new message ────────────────────────────────────────────
    body = request.get_json(silent=True) or {}
    user_id = body.get("userId")
    sender_id = body.get("senderId")
    sender_role = (body.get("senderRole") or "user").strip().lower()
    sender_name = (body.get("senderName") or "").strip()
    message_text = (body.get("message") or "").strip()

    if not user_id or not sender_id or not message_text:
        return jsonify({"message": "userId, senderId, and message are required."}), 400

    try:
        user_id = int(user_id)
        sender_id = int(sender_id)
    except ValueError:
        return jsonify({"message": "Invalid userId or senderId."}), 400

    msg_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "id": msg_id,
        "user_id": user_id,
        "sender_id": sender_id,
        "sender_role": sender_role,
        "sender_name": sender_name,
        "message": message_text,
        "read": False,
        "created_at": created_at,
    }

    # Try Supabase first
    sent = None
    try:
        result = _supabase("POST", TABLE_NAME, payload=payload)
        if isinstance(result, list) and result:
            sent = _serialize_message(result[0])
    except Exception:
        sent = None

    # Always persist to local SQLite as well or as fallback
    with _get_local_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO osca_chat_messages
            (id, user_id, sender_id, sender_role, sender_name, message, read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, user_id, sender_id, sender_role, sender_name, message_text, 0, created_at),
        )
        conn.commit()

    if sent is None:
        sent = _serialize_message(payload)

    return jsonify({"message": sent}), 201


@osca_chat_bp.route("/threads", methods=["GET", "OPTIONS"])
def threads():
    """Returns conversation summaries grouped by senior citizen for OSCA Admin."""
    if request.method == "OPTIONS":
        return ("", 204)

    rows = None
    try:
        res = _supabase(
            "GET",
            TABLE_NAME,
            params={
                "order": "created_at.desc",
                "select": "*",
                "limit": "500",
            },
        )
        if isinstance(res, list):
            rows = [dict(r) for r in res]
    except Exception:
        rows = None

    if rows is None:
        with _get_local_db() as conn:
            cursor = conn.execute("SELECT * FROM osca_chat_messages ORDER BY created_at DESC LIMIT 500")
            rows = [dict(r) for r in cursor.fetchall()]

    threads_map: dict[int, dict] = {}
    for r in rows:
        uid = r.get("user_id")
        if not uid:
            continue
        if uid not in threads_map:
            threads_map[uid] = {
                "userId": uid,
                "userName": f"Senior Citizen #{uid}",
                "avatarUrl": None,
                "lastMessage": r.get("message", ""),
                "lastMessageAt": r.get("created_at", ""),
                "lastSenderRole": r.get("sender_role", "user"),
                "lastSenderName": r.get("sender_name", ""),
                "unreadCount": 0,
            }
        if r.get("sender_role") == "user" and not r.get("read"):
            threads_map[uid]["unreadCount"] += 1

    # Enrich with senior citizen user profile details
    user_ids = list(threads_map.keys())
    if user_ids:
        try:
            users_res = _supabase(
                "GET",
                Config.SUPABASE_USERS_TABLE,
                params={
                    "id": f"in.({','.join(map(str, user_ids))})",
                    "select": "id,first_name,last_name,avatar_url,contact",
                },
            )
            if isinstance(users_res, list):
                for u in users_res:
                    uid = u.get("id")
                    if uid in threads_map:
                        first = (u.get("first_name") or "").strip()
                        last = (u.get("last_name") or "").strip()
                        full = f"{first} {last}".strip()
                        if full:
                            threads_map[uid]["userName"] = full
                        threads_map[uid]["avatarUrl"] = u.get("avatar_url")
                        threads_map[uid]["contact"] = u.get("contact")
        except Exception:
            pass

    sorted_threads = sorted(
        threads_map.values(),
        key=lambda t: t.get("lastMessageAt") or "",
        reverse=True,
    )

    return jsonify({"threads": sorted_threads}), 200


@osca_chat_bp.route("/unread-count", methods=["GET", "OPTIONS"])
def unread_count():
    """Returns badge count of unread messages."""
    if request.method == "OPTIONS":
        return ("", 204)

    role = (request.args.get("role") or "user").strip().lower()
    user_id_raw = request.args.get("userId")

    # Try Supabase first
    try:
        params: dict = {
            "read": "eq.false",
            "select": "id",
        }
        if role in ("osca admin", "super admin", "admin"):
            params["sender_role"] = "eq.user"
        else:
            if not user_id_raw:
                return jsonify({"unreadCount": 0}), 200
            user_id = int(user_id_raw)
            params["user_id"] = f"eq.{user_id}"
            params["sender_role"] = "neq.user"

        rows = _supabase("GET", TABLE_NAME, params=params)
        if isinstance(rows, list):
            return jsonify({"unreadCount": len(rows)}), 200
    except Exception:
        pass

    # Fallback to local DB
    try:
        with _get_local_db() as conn:
            if role in ("osca admin", "super admin", "admin"):
                cursor = conn.execute("SELECT COUNT(*) FROM osca_chat_messages WHERE sender_role = 'user' AND read = 0")
            else:
                if not user_id_raw:
                    return jsonify({"unreadCount": 0}), 200
                user_id = int(user_id_raw)
                cursor = conn.execute(
                    "SELECT COUNT(*) FROM osca_chat_messages WHERE user_id = ? AND sender_role != 'user' AND read = 0",
                    (user_id,),
                )
            count = cursor.fetchone()[0]
            return jsonify({"unreadCount": count}), 200
    except Exception:
        return jsonify({"unreadCount": 0}), 200
