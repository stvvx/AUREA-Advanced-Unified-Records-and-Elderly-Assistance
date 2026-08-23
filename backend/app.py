import base64
import mimetypes
import os
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

import face_verifier


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or ""
).strip().rstrip("/")

SUPABASE_SERVICE_ROLE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
).strip()

SUPABASE_USERS_TABLE = (
    os.environ.get("SUPABASE_USERS_TABLE", "users").strip()
    or "users"
)

PORT = int(os.environ.get("PORT", "5000"))

_table_ready = False

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Supabase REST Helpers
# ---------------------------------------------------------------------------

def _rest_headers(*, prefer_return: bool = False) -> dict:
    """
    Headers for Supabase REST API.

    IMPORTANT:
    The new Supabase sb_secret_... key is used as the API key.
    Do NOT send it as:
        Authorization: Bearer sb_secret_...
    because that causes:
        JWT could not be decoded
    """

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }

    if prefer_return:
        headers["Prefer"] = "return=representation"

    return headers


def normalize_address(data: dict) -> str:
    """Normalize registration/profile address from either a flat string or structured parts."""
    if isinstance(data.get("address"), str) and data["address"].strip():
        return data["address"].strip()

    parts = []

    house_no = str(data.get("houseNo", "") or "").strip()
    street = str(data.get("street", "") or "").strip()
    subdivision = str(data.get("subdivision", "") or "").strip()
    barangay = str(data.get("barangay", "") or "").strip()

    if house_no:
        parts.append(house_no)
    if street:
        parts.append(street)
    if subdivision:
        parts.append(subdivision)
    if barangay:
        parts.append(f"Brgy. {barangay}")
    if not parts:
        parts.append("Pateros")
    else:
        parts.append("Pateros")

    return ", ".join(parts)


def supabase_rest(
    method: str,
    table: str,
    *,
    params=None,
    payload=None
):
    """
    Execute a request against the Supabase PostgREST API.
    """

    if not SUPABASE_URL:
        raise RuntimeError(
            "SUPABASE_URL is missing from backend/.env"
        )

    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is missing from backend/.env"
        )

    url = f"{SUPABASE_URL}/rest/v1/{table}"

    try:
        response = requests.request(
            method.upper(),
            url,
            headers=_rest_headers(
                prefer_return=(method.upper() == "POST")
            ),
            params=params,
            json=payload,
            timeout=15,
        )

    except requests.RequestException as exc:
        raise RuntimeError(
            f"Cannot reach Supabase: {exc}"
        ) from exc

    if not response.ok:
        try:
            body = response.json()

            detail = (
                body.get("message")
                or body.get("hint")
                or body.get("details")
                or str(body)
            )

        except ValueError:
            detail = response.text

        raise RuntimeError(
            f"Supabase REST error ({response.status_code}): {detail}"
        )

    if response.content:
        try:
            return response.json()
        except ValueError:
            return []

    return []


# ---------------------------------------------------------------------------
# Check Users Table
# ---------------------------------------------------------------------------

def ensure_users_table() -> None:
    """
    Check whether the users table exists.

    The table is created manually in Supabase SQL Editor.
    Flask does not attempt to use the Supabase Management API.
    """

    global _table_ready

    if _table_ready:
        return

    try:
        supabase_rest(
            "GET",
            SUPABASE_USERS_TABLE,
            params={
                "select": "id",
                "limit": "1",
            },
        )

        _table_ready = True

        print(
            f"[AUREA] Table '{SUPABASE_USERS_TABLE}' is ready."
        )

    except RuntimeError as exc:
        raise RuntimeError(
            f"Cannot access table '{SUPABASE_USERS_TABLE}'. "
            f"Make sure you created it in Supabase SQL Editor. "
            f"Details: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = (
        "Content-Type, Authorization"
    )
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PUT, PATCH, OPTIONS"
    )

    return response


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():

    try:
        ensure_users_table()

        return jsonify({
            "status": "ok",
            "supabaseConfigured": True,
            "tableReady": True,
        })

    except RuntimeError as exc:

        return jsonify({
            "status": "error",
            "supabaseConfigured": bool(
                SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
            ),
            "tableReady": False,
            "message": str(exc),
        }), 500


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@app.route("/api/auth/register", methods=["POST", "OPTIONS"])
def register():

    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    address = normalize_address(data)

    required = [
        "firstName",
        "lastName",
        "dob",
        "contact",
        "email",
        "password",
    ]

    missing = [
        field
        for field in required
        if not str(data.get(field, "")).strip()
    ]

    if missing:
        return jsonify({
            "message": (
                "Missing required fields: "
                + ", ".join(missing)
            )
        }), 400

    if not address or address == "Pateros":
        return jsonify({
            "message": "Address information is required."
        }), 400

    email = str(data["email"]).strip().lower()
    password = str(data["password"])

    if len(password) < 8:
        return jsonify({
            "message": "Password must be at least 8 characters."
        }), 400

    try:

        # Check users table
        ensure_users_table()

        # Check if email already exists
        existing = supabase_rest(
            "GET",
            SUPABASE_USERS_TABLE,
            params={
                "select": "id",
                "email": f"eq.{email}",
                "limit": "1",
            },
        )

        if existing:
            return jsonify({
                "message": "Email is already registered."
            }), 409

        # Create user
        created = supabase_rest(
            "POST",
            SUPABASE_USERS_TABLE,
            payload={
                "first_name": (
                    str(data["firstName"]).strip()
                ),

                "middle_name": (
                    str(data.get("middleName", "")).strip()
                    or None
                ),

                "last_name": (
                    str(data["lastName"]).strip()
                ),

                "dob": (
                    str(data["dob"]).strip()
                ),

                "contact": (
                    str(data["contact"]).strip()
                ),

                "address": address,

                "gender": (
                    str(data.get("gender", "")).strip()
                    or None
                ),

                "civil_status": (
                    str(data.get("civilStatus", "")).strip()
                    or None
                ),

                "email": email,

                "password_hash": (
                    generate_password_hash(password)
                ),

                "created_at": (
                    datetime.utcnow().isoformat()
                ),
            },
        )

    except RuntimeError as exc:

        return jsonify({
            "message": str(exc)
        }), 500

    user = created[0] if created else {}

    return jsonify({
        "message": "Account created successfully.",
        "userId": user.get("id"),
    }), 201


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@app.route("/api/auth/login", methods=["POST", "OPTIONS"])
def login():

    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    email = (
        str(data.get("email", ""))
        .strip()
        .lower()
    )

    password = str(
        data.get("password", "")
    )

    if not email or not password:
        return jsonify({
            "message": "Email and password are required."
        }), 400

    try:

        # Check users table
        ensure_users_table()

        # Find user
        result = supabase_rest(
            "GET",
            SUPABASE_USERS_TABLE,
            params={
                "select": (
                    "id,"
                    "first_name,"
                    "middle_name,"
                    "last_name,"
                    "dob,"
                    "contact,"
                    "address,"
                    "email,"
                    "avatar_url,"
                    "gender,"
                    "civil_status,"
                    "role,"
                    "password_hash"
                ),

                "email": f"eq.{email}",

                "limit": "1",
            },
        )

    except RuntimeError as exc:

        return jsonify({
            "message": str(exc)
        }), 500

    user = result[0] if result else None

    # Validate login
    if (
        not user
        or not check_password_hash(
            user["password_hash"],
            password
        )
    ):

        return jsonify({
            "message": "Invalid email or password."
        }), 401

    return jsonify({
        "message": "Login successful.",

        "user": {
            "id": user["id"],

            "firstName": user["first_name"],

            "middleName": user.get("middle_name") or "",

            "lastName": user["last_name"],

            "dob": user.get("dob") or "",

            "contact": user.get("contact") or "",

            "address": user.get("address") or "",

            "email": user["email"],

            "avatarUrl": user.get("avatar_url") or "",
            "gender": user.get("gender") or "",
            "civilStatus": user.get("civil_status") or "",
            "role": user.get("role") or "user",
            "hasEnrolledFace": bool(user.get("avatar_url")),
        },
    }), 200


# ---------------------------------------------------------------------------
# Facial Biometric Verification & Enrollment
# ---------------------------------------------------------------------------

def _fetch_user_reference_photo(avatar_url: str, user_id: int) -> tuple[bool, bytes | None, str]:
    """Fetches the enrolled reference image bytes for a user from public URL or Supabase storage."""
    if not avatar_url:
        return False, None, "User does not have an enrolled face photo."

    # 1. Try direct HTTP fetch from avatar_url
    if avatar_url.startswith("http://") or avatar_url.startswith("https://"):
        try:
            resp = requests.get(avatar_url, timeout=10)
            if resp.ok and resp.content:
                return True, resp.content, "Photo retrieved."
        except Exception:
            pass

    # 2. Fallback to Supabase Storage REST API using service role key
    try:
        bucket = SUPABASE_STORAGE_BUCKET
        file_candidates = [
            f"user_{user_id}/avatar.jpg",
            f"user_{user_id}/avatar.png",
            f"user_{user_id}/avatar.jpeg",
        ]
        for path in file_candidates:
            storage_url = f"{SUPABASE_URL}/storage/v1/object/authenticated/{bucket}/{path}"
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            }
            resp = requests.get(storage_url, headers=headers, timeout=10)
            if resp.ok and resp.content:
                return True, resp.content, "Photo retrieved from storage."
    except Exception as exc:
        print(f"[AUREA Face] Storage fallback error: {exc}")

    return False, None, "Could not load registered face photo from storage."


@app.route("/api/auth/verify-face", methods=["POST", "OPTIONS"])
def verify_face():
    """
    Verifies a live camera capture selfie or multi-angle 3D liveness frames
    (Center, Left, Right) against the user's enrolled profile photo.
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    user_id = data.get("userId") or data.get("id")
    live_image = data.get("image")  # base64 string
    images_dict = data.get("images")  # {"center": ..., "left": ..., "right": ...}
    center_img = data.get("centerImage") or data.get("center")
    left_img = data.get("leftImage") or data.get("left")
    right_img = data.get("rightImage") or data.get("right")

    if not user_id:
        return jsonify({"message": "User ID is required.", "verified": False}), 400

    # Build live payload: either multi-angle dictionary or single image
    if images_dict and isinstance(images_dict, dict) and ("center" in images_dict or "left" in images_dict):
        live_payload = images_dict
    elif center_img and left_img and right_img:
        live_payload = {"center": center_img, "left": left_img, "right": right_img}
    elif live_image:
        live_payload = live_image
    elif center_img:
        live_payload = center_img
    else:
        return jsonify({"message": "No live selfie images provided for verification.", "verified": False}), 400

    try:
        ensure_users_table()

        # Retrieve user profile
        result = supabase_rest(
            "GET",
            SUPABASE_USERS_TABLE,
            params={
                "select": SELECT_FIELDS,
                "id": f"eq.{user_id}",
                "limit": "1",
            },
        )

        if not result:
            return jsonify({"message": "User not found.", "verified": False}), 404

        user = result[0]
        avatar_url = user.get("avatar_url")

        if not avatar_url:
            return jsonify({
                "verified": False,
                "requiresEnrollment": True,
                "message": "No registered face photo found on this account. Please enroll your face first.",
                "user": _serialize_user(user),
            }), 400

        # Retrieve reference photo
        ok, ref_bytes, msg = _fetch_user_reference_photo(avatar_url, user_id)
        if not ok or not ref_bytes:
            return jsonify({
                "verified": False,
                "requiresEnrollment": True,
                "message": msg,
                "user": _serialize_user(user),
            }), 400

        # Perform OpenCV Biometric Face Verification & 3D Liveness Detection
        res = face_verifier.verify_faces(reference_data=ref_bytes, live_data=live_payload)

        if res["verified"]:
            return jsonify({
                "verified": True,
                "livenessPassed": res.get("liveness_passed", True),
                "confidence": res.get("confidence", 95.0),
                "score": res.get("score", 0.0),
                "angles": res.get("angles", {}),
                "message": res["message"],
                "user": _serialize_user(user),
            }), 200
        else:
            return jsonify({
                "verified": False,
                "livenessPassed": res.get("liveness_passed", False),
                "confidence": res.get("confidence", 0.0),
                "score": res.get("score", 0.0),
                "angles": res.get("angles", {}),
                "message": res["message"],
            }), 401

    except Exception as exc:
        print(f"[AUREA Face] Error during verification: {exc}")
        return jsonify({
            "verified": False,
            "message": f"Server verification error: {str(exc)}",
        }), 500


@app.route("/api/auth/enroll-face", methods=["POST", "OPTIONS"])
def enroll_face():
    """
    Validates and enrolls a new biometric face photo for a user.
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    user_id = data.get("userId") or data.get("id")
    image_b64 = data.get("image")
    mime_type = data.get("mimeType", "image/jpeg")

    if not user_id:
        return jsonify({"message": "User ID is required."}), 400

    if not image_b64:
        return jsonify({"message": "No image provided for enrollment."}), 400

    try:
        ensure_users_table()

        # Validate that a clear face is present
        validation = face_verifier.validate_enrollment_photo(image_b64)
        if not validation["valid"]:
            return jsonify({
                "success": False,
                "message": validation["message"],
            }), 400

        # Decode image
        try:
            clean_b64 = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64
            image_bytes = base64.b64decode(clean_b64.strip())
        except Exception:
            return jsonify({"message": "Invalid base64 image data."}), 400

        ext = mimetypes.guess_extension(mime_type) or ".jpg"
        if ext == ".jpe":
            ext = ".jpg"
        file_path = f"user_{user_id}/avatar{ext}"

        # Upload to Supabase Storage
        storage_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{file_path}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": mime_type,
            "x-upsert": "true",
        }

        resp = requests.put(storage_url, headers=headers, data=image_bytes, timeout=30)
        if not resp.ok:
            detail = resp.text or resp.reason
            return jsonify({"message": f"Storage upload failed: {detail}"}), 500

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{file_path}"

        # Save to users table
        patch_url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_USERS_TABLE}"
        patch_resp = requests.patch(
            patch_url,
            headers=_rest_headers(prefer_return=True),
            params={"id": f"eq.{user_id}"},
            json={"avatar_url": public_url},
            timeout=15,
        )

        updated_user = {}
        if patch_resp.ok and patch_resp.content:
            rows = patch_resp.json()
            if rows:
                updated_user = rows[0]

        return jsonify({
            "success": True,
            "avatarUrl": public_url,
            "message": "Face biometric registered successfully!",
            "user": _serialize_user(updated_user) if updated_user else None,
        }), 200

    except Exception as exc:
        print(f"[AUREA Face] Enrollment error: {exc}")
        return jsonify({"message": str(exc)}), 500


# ---------------------------------------------------------------------------
# Get / Update User
# ---------------------------------------------------------------------------

SELECT_FIELDS = "id,first_name,middle_name,last_name,dob,gender,civil_status,contact,address,email,avatar_url,role,created_at"


def _serialize_user(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "firstName": u.get("first_name") or "",
        "middleName": u.get("middle_name") or "",
        "lastName": u.get("last_name") or "",
        "dob": u.get("dob") or "",
        "gender": u.get("gender") or "",
        "civilStatus": u.get("civil_status") or "",
        "contact": u.get("contact") or "",
        "address": u.get("address") or "",
        "email": u.get("email") or "",
        "avatarUrl": u.get("avatar_url") or "",
        "role": u.get("role") or "user",
        "createdAt": u.get("created_at") or "",
    }


@app.route("/api/user/<int:user_id>", methods=["GET", "PUT", "OPTIONS"])
def user_profile(user_id):
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        ensure_users_table()
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500

    # --- GET ---
    if request.method == "GET":
        result = supabase_rest(
            "GET", SUPABASE_USERS_TABLE,
            params={"select": SELECT_FIELDS, "id": f"eq.{user_id}", "limit": "1"},
        )
        if not result:
            return jsonify({"message": "User not found."}), 404
        return jsonify({"user": _serialize_user(result[0])}), 200

    # --- PUT ---
    data = request.get_json(silent=True) or {}
    payload = {}

    field_map = {
        "firstName": "first_name",
        "middleName": "middle_name",
        "lastName": "last_name",
        "dob": "dob",
        "contact": "contact",
        "email": "email",
        "avatarUrl": "avatar_url",
        "profilePhoto": "avatar_url",
        "gender": "gender",
        "civilStatus": "civil_status",
    }
    for key, col in field_map.items():
        if key in data:
            payload[col] = str(data[key]).strip() or None

    if "email" in payload and payload["email"]:
        payload["email"] = payload["email"].lower()

    if "address" in data or any(k in data for k in ["houseNo", "street", "subdivision", "barangay"]):
        payload["address"] = normalize_address(data)

    if not payload:
        return jsonify({"message": "No fields to update."}), 400

    try:
        url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_USERS_TABLE}"
        headers = _rest_headers(prefer_return=True)
        resp = requests.patch(url, headers=headers, params={"id": f"eq.{user_id}"}, json=payload, timeout=15)
        if not resp.ok:
            detail = resp.json().get("message", resp.text) if resp.content else resp.text
            return jsonify({"message": f"Update failed: {detail}"}), 500
        updated = resp.json()
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500

    u = updated[0] if updated else {}
    return jsonify({"message": "Profile updated.", "user": _serialize_user(u)}), 200


# ---------------------------------------------------------------------------
# Avatar Upload
# ---------------------------------------------------------------------------

import base64
import mimetypes

SUPABASE_STORAGE_BUCKET = (
    os.environ.get("SUPABASE_STORAGE_BUCKET")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET")
    or "avatars"
).strip() or "avatars"


@app.route("/api/user/<int:user_id>/avatar", methods=["POST", "OPTIONS"])
def upload_avatar(user_id):
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image")       # base64 string
    mime_type = data.get("mimeType", "image/jpeg")

    if not image_b64:
        return jsonify({"message": "No image provided."}), 400

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        return jsonify({"message": "Invalid base64 image."}), 400

    ext = mimetypes.guess_extension(mime_type) or ".jpg"
    if ext == ".jpe":
        ext = ".jpg"
    file_path = f"user_{user_id}/avatar{ext}"

    storage_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{file_path}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": mime_type,
        "x-upsert": "true",
    }

    try:
        resp = requests.put(storage_url, headers=headers, data=image_bytes, timeout=30)
        if not resp.ok:
            detail = resp.text or resp.reason
            if "Bucket not found" in detail or "bucket" in detail.lower() and "not found" in detail.lower():
                return jsonify({
                    "message": f"Supabase storage bucket '{SUPABASE_STORAGE_BUCKET}' does not exist. Create it in the Supabase dashboard and set it to Public."
                }), 500
            return jsonify({"message": f"Storage upload failed: {detail}"}), 500
    except requests.RequestException as exc:
        return jsonify({"message": f"Cannot reach Supabase Storage: {exc}"}), 500

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{file_path}"

    # Save URL to users table
    try:
        patch_url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_USERS_TABLE}"
        requests.patch(
            patch_url,
            headers=_rest_headers(),
            params={"id": f"eq.{user_id}"},
            json={"avatar_url": public_url},
            timeout=15,
        )
    except Exception:
        pass  # URL is still returned even if DB update fails

    return jsonify({"avatarUrl": public_url}), 200


# ---------------------------------------------------------------------------
# Admin — Users & Transactions
# ---------------------------------------------------------------------------

ADMIN_ROLES = {"osca admin", "med admin", "super admin"}


@app.route("/api/admin/users", methods=["GET", "OPTIONS"])
def admin_users():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        ensure_users_table()
        result = supabase_rest(
            "GET", SUPABASE_USERS_TABLE,
            params={"select": SELECT_FIELDS, "order": "created_at.desc"},
        )
        return jsonify({"users": [_serialize_user(u) for u in result]}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/admin/transactions", methods=["GET", "OPTIONS"])
def admin_transactions():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        result = supabase_rest(
            "GET", "transactions",
            params={"select": "*", "order": "created_at.desc"},
        )
        return jsonify({"transactions": result}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    print("[AUREA] Starting backend...")

    try:

        ensure_users_table()

    except RuntimeError as exc:

        print(
            f"[AUREA] Startup warning: {exc}"
        )

    print(
        f"[AUREA] Server starting on port {PORT}..."
    )

    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=True,
    )