"""
backend/routes/memory.py
─────────────────────────────────────────────────────────────────────────────
LOLO AUREA Memory API Blueprint — Phase 6

Endpoints:
  GET    /api/lolo/memory             → list all memories for a user
  POST   /api/lolo/memory             → manually create a memory
  DELETE /api/lolo/memory/<memory_id> → delete one memory
  DELETE /api/lolo/memory/all         → clear all memories for a user
─────────────────────────────────────────────────────────────────────────────
"""

from flask import Blueprint, jsonify, request

from services import memory_service
from services.memory_service import MEMORY_CATEGORIES, MEMORY_PRIORITIES

# ─── Blueprint ────────────────────────────────────────────────────────────────

lolo_memory_bp = Blueprint("lolo_memory", __name__, url_prefix="/api/lolo/memory")


# ─── GET /api/lolo/memory ─────────────────────────────────────────────────────

@lolo_memory_bp.route("", methods=["GET", "OPTIONS"])
def list_memories():
    """
    List all memories for a user.

    Query params:
        userId   (int, required)
        limit    (int, optional, default=50, max=100)

    Response:
        {
            "success": true,
            "memories": [ ... ],
            "total": 12
        }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    user_id_raw = request.args.get("userId") or request.args.get("user_id")
    if not user_id_raw:
        return jsonify({"success": False, "error": "userId is required."}), 400

    try:
        user_id = int(user_id_raw)
    except ValueError:
        return jsonify({"success": False, "error": "userId must be an integer."}), 400

    limit = min(int(request.args.get("limit", 50)), 100)

    memories = memory_service.get_memories(user_id, limit=limit)

    return jsonify({
        "success":  True,
        "memories": memories,
        "total":    len(memories),
    }), 200


# ─── POST /api/lolo/memory ────────────────────────────────────────────────────

@lolo_memory_bp.route("", methods=["POST", "OPTIONS"])
def create_memory():
    """
    Manually create a memory entry.

    Request JSON:
        {
            "userId":   123,
            "content":  "User's name is Pedro Cruz",
            "priority": "high",
            "category": "personal",
            "sourceConversationId": "uuid"  // optional
        }

    Response:
        {
            "success": true,
            "memory":  { ... }
        }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    user_id_raw = data.get("userId") or data.get("user_id")
    content     = str(data.get("content") or "").strip()
    priority    = str(data.get("priority", "medium")).lower()
    category    = str(data.get("category", "other")).lower()
    conv_id     = data.get("sourceConversationId") or data.get("source_conversation_id")

    if not user_id_raw:
        return jsonify({"success": False, "error": "userId is required."}), 400
    if not content:
        return jsonify({"success": False, "error": "content is required."}), 400
    if priority not in MEMORY_PRIORITIES:
        return jsonify({"success": False, "error": f"priority must be one of {list(MEMORY_PRIORITIES)}."}), 400
    if category not in MEMORY_CATEGORIES:
        return jsonify({"success": False, "error": f"category must be one of {list(MEMORY_CATEGORIES)}."}), 400

    try:
        user_id = int(user_id_raw)
    except ValueError:
        return jsonify({"success": False, "error": "userId must be an integer."}), 400

    created = memory_service.store_memory(
        user_id=user_id,
        content=content,
        priority=priority,
        category=category,
        conversation_id=conv_id,
    )

    if not created:
        return jsonify({"success": False, "error": "Failed to store memory. Supabase may be unreachable."}), 500

    return jsonify({"success": True, "memory": created}), 201


# ─── DELETE /api/lolo/memory/all ─────────────────────────────────────────────

@lolo_memory_bp.route("/all", methods=["DELETE", "OPTIONS"])
def clear_all_memories():
    """
    Delete ALL memories for a user.

    Query params:
        userId (int, required)

    Response:
        { "success": true, "message": "All memories cleared." }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    user_id_raw = request.args.get("userId") or request.args.get("user_id")
    if not user_id_raw:
        return jsonify({"success": False, "error": "userId is required."}), 400

    try:
        user_id = int(user_id_raw)
    except ValueError:
        return jsonify({"success": False, "error": "userId must be an integer."}), 400

    success = memory_service.delete_all_memories(user_id)

    if not success:
        return jsonify({"success": False, "error": "Failed to clear memories."}), 500

    return jsonify({
        "success": True,
        "message": "All memories cleared.",
    }), 200


# ─── DELETE /api/lolo/memory/<memory_id> ─────────────────────────────────────

@lolo_memory_bp.route("/<memory_id>", methods=["DELETE", "OPTIONS"])
def delete_memory(memory_id: str):
    """
    Delete a single memory by ID.

    Response:
        { "success": true, "message": "Memory deleted." }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    if not memory_id or len(memory_id) < 10:
        return jsonify({"success": False, "error": "Invalid memory ID."}), 400

    success = memory_service.delete_memory(memory_id)

    if not success:
        return jsonify({"success": False, "error": "Failed to delete memory."}), 500

    return jsonify({
        "success": True,
        "message": "Memory deleted.",
    }), 200
