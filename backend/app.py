import base64
import secrets
import ipaddress
from decimal import Decimal, InvalidOperation
import mimetypes
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from itsdangerous import URLSafeTimedSerializer, BadSignature
from services.registration_id import scan_registration_id
from werkzeug.security import check_password_hash, generate_password_hash

import face_verifier
import assistant_service
from routes import register_lolo_routes
from services.senior_categories import SENIOR_CATEGORIES
from services.senior_profiles import with_senior_fields, income_source_patch
from services.service_records import service_records


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

FACE_VERIFICATION_EXEMPT_ROLES = {
    "osca admin",

    "med admin",
    "health center",
    "super admin",
}

_table_ready = False

app = Flask(__name__)
registration_id_signer = URLSafeTimedSerializer(
    os.environ.get("SECRET_KEY") or SUPABASE_SERVICE_ROLE_KEY or secrets.token_hex(32),
    salt="registration-id-scan",
)


def registered_senior_id(id_number):
    return bool(supabase_rest("GET", "seniors", params={
        "osca_id_number": f"eq.{id_number}", "select": "id", "limit": "1",
    }))


@app.route("/api/auth/scan-senior-id", methods=["POST"])
def scan_senior_id():
    data = request.get_json(silent=True) or {}
    try:
        details = scan_registration_id(data.get("image"), data.get("mimeType", "image/jpeg"))
        try:
            already_registered = registered_senior_id(details["idNumber"])
        except Exception:
            return jsonify({"message": "Your ID was read, but account records could not be checked. Please try again shortly."}), 503
        if already_registered:
            return jsonify({"message": "This senior citizen ID is already linked to an account. Please log in or contact OSCA."}), 409
        return jsonify({"details": details, "scanToken": registration_id_signer.dumps(details)}), 200
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 503
    except Exception:
        app.logger.exception("Registration ID scanning failed")
        return jsonify({"message": "Could not read your ID photo. Please try again with a clearer image."}), 503



def requires_face_verification(role: str | None) -> bool:
    return (role or "user").strip().lower() not in FACE_VERIFICATION_EXEMPT_ROLES


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
            rows = response.json()
            if method.upper() == "GET" and table == SUPABASE_USERS_TABLE:
                return with_senior_fields(rows, supabase_rest)
            return rows
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
        "Content-Type, Authorization, X-Requested-With"
    )
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    )
    response.headers["Access-Control-Max-Age"] = "86400"

    return response


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():

    try:
        ensure_users_table()

        gemini_configured = bool(
            os.environ.get("GEMINI_API_KEY", "").strip()
            and os.environ.get("GEMINI_API_KEY", "").strip() != "your_gemini_api_key_here"
        )

        return jsonify({
            "status": "ok",
            "supabaseConfigured": True,
            "tableReady": True,
            "lolo": {
                "status": "ok",
                "geminiConfigured": gemini_configured,
                "mode": "gemini" if gemini_configured else "knowledge_engine",
            },
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

    scanned_id = None
    if data.get("hasExistingSeniorId"):
        try:
            scanned_id = registration_id_signer.loads(data.get("seniorIdScanToken", ""), max_age=7200)
        except BadSignature:
            return jsonify({"message": "Please scan your senior citizen ID again before registering."}), 400
        try:
            if registered_senior_id(scanned_id["idNumber"]):
                return jsonify({"message": "This ID is already linked to an account. Please log in or contact OSCA."}), 409
        except Exception:
            return jsonify({"message": "Unable to check existing ID records. Please try again."}), 503

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
    if scanned_id and user.get("id"):
        try:
            profiles = supabase_rest("GET", "seniors", params={"user_id": f"eq.{user['id']}", "select": "id", "limit": "1"})
            if not profiles:
                raise RuntimeError("No linked senior profile")
            supabase_rest("PATCH", "seniors", params={"user_id": f"eq.{user['id']}"},
                          payload={"osca_id_number": scanned_id["idNumber"]})
        except Exception:
            # Undo this newly created account so registration can be retried safely.
            supabase_rest("DELETE", SUPABASE_USERS_TABLE, params={"id": f"eq.{user['id']}"})
            return jsonify({"message": "Could not attach your existing ID. Please contact OSCA or try again."}), 503

    return jsonify({
        "message": "Account created successfully.",
        "userId": user.get("id"),
    }), 201


# Session lifecycle. A users row stores the one current session for that account.
def client_ip_address():
    value = request.remote_addr or ""
    if os.environ.get("TRUST_PROXY_HEADERS", "false").lower() == "true":
        value = (request.headers.get("X-Forwarded-For") or value).split(",")[0].strip()
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def issue_user_session(user):
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    supabase_rest("PATCH", SUPABASE_USERS_TABLE, params={"id": f"eq.{user['id']}"}, payload={
        "token": token, "token_expires_at": expires.isoformat(), "ip_address": client_ip_address(),
    })
    return {**_serialize_user(user), "token": token, "tokenExpiresAt": expires.isoformat()}


def bearer_session_token():
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


@app.route("/api/auth/session", methods=["GET"])
def current_session():
    token = bearer_session_token()
    if len(token) < 32 or len(token) > 256:
        return jsonify({"message": "Please log in again."}), 401
    rows = supabase_rest("GET", SUPABASE_USERS_TABLE, params={
        "token": f"eq.{token}", "select": "*", "limit": "1",
    })
    if not rows:
        return jsonify({"message": "Your session has ended. Please log in again."}), 401
    try:
        expires = datetime.fromisoformat(str(rows[0].get("token_expires_at") or "").replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"message": "Your session has expired. Please log in again."}), 401
    return jsonify({"user": _serialize_user(rows[0])}), 200


@app.route("/api/auth/logout", methods=["POST"])
def logout_session():
    token = bearer_session_token()
    if len(token) < 32 or len(token) > 256:
        return jsonify({"message": "Invalid session token."}), 401
    # Matching the token also prevents an old device from clearing a newer login.
    supabase_rest("PATCH", SUPABASE_USERS_TABLE, params={"token": f"eq.{token}"}, payload={
        "token": None, "token_expires_at": None,
    })
    return jsonify({"message": "Logged out."}), 200


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

    try:
        response_user = _serialize_user(user)
        if not requires_face_verification(user.get("role")):
            response_user = issue_user_session(user)
        response_user.update({
            "requiresFaceVerification": requires_face_verification(user.get("role")),
            "hasEnrolledFace": bool(user.get("avatar_url")),
        })
        return jsonify({"message": "Login successful.", "user": response_user}), 200
    except RuntimeError:
        return jsonify({"message": "Could not start your session. Please try again."}), 503



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
        if not requires_face_verification(user.get("role")):
            return jsonify({
                "verified": False,
                "message": "Face verification is not required for this account.",
                "user": _serialize_user(user),
            }), 403

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
                "user": issue_user_session(user),
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

        user_result = supabase_rest(
            "GET",
            SUPABASE_USERS_TABLE,
            params={
                "select": "id,role",
                "id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        if not user_result:
            return jsonify({"message": "User not found."}), 404
        if not requires_face_verification(user_result[0].get("role")):
            return jsonify({
                "success": False,
                "message": "Face enrollment is not required for this account.",
            }), 403

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

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{file_path}?v={int(time.time())}"

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
            "user": issue_user_session(updated_user) if updated_user else None,
        }), 200

    except Exception as exc:
        print(f"[AUREA Face] Enrollment error: {exc}")
        return jsonify({"message": str(exc)}), 500


# ---------------------------------------------------------------------------
# Get / Update User
# ---------------------------------------------------------------------------

SELECT_FIELDS = "id,first_name,middle_name,last_name,dob,gender,civil_status,contact,address,email,avatar_url,birth_certificate,children,role,created_at"


def _serialize_user(u: dict) -> dict:
    sig = (
        u.get("digital_signature")
        or u.get("signature")
        or u.get("signature_url")
        or u.get("digital_signature_url")
        or ""
    )
    birth_cert = u.get("birth_certificate") or u.get("birthcert") or None
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
        "birthcert": birth_cert,
        "birthCertificate": birth_cert,
        "children": u.get("children") or [],
        "signature": sig,
        "digitalSignature": sig,
        "role": u.get("role") or "user",
        "status": u.get("status") or "Active",
        "accountStatus": u.get("status") or "Active",
        "createdAt": u.get("created_at") or "",
        "oscaIdNumber": u.get("osca_id_number") or "",
        "spouse": u.get("spouse") or "",
        "monthlyIncome": u.get("monthly_income"),
        "sourceOfIncome": u.get("source_of_income"),
        "occupation": u.get("occupation"),
        "category": u.get("category") or "",
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
            params={"select": "*", "id": f"eq.{user_id}", "limit": "1"},
        )
        if not result:
            return jsonify({"message": "User not found."}), 404
        return jsonify({"user": _serialize_user(result[0])}), 200

    # --- PUT ---
    data = request.get_json(silent=True) or {}
    payload = {}
    senior_income = None
    if "sourceOfIncome" in data or "occupation" in data:
        try:
            profiles = supabase_rest("GET", "seniors", params={"user_id": f"eq.{user_id}", "select": "source_of_income,occupation", "limit": "1"})
            if not profiles:
                return jsonify({"message": "Senior profile not found."}), 404
            senior_income = income_source_patch(data, profiles[0])
        except ValueError as exc:
            return jsonify({"message": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"message": str(exc)}), 500


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
        "spouse": "spouse",
        "category": "category",
        "monthlyIncome": "monthly_income",
        "children": "children",
        "birthcert": "birth_certificate",
        "birthCertificate": "birth_certificate",
        "birth_certificate": "birth_certificate",
    }
    for key, col in field_map.items():
        if key in data:
            if key == "category":
                if not isinstance(data[key], str) or data[key] not in SENIOR_CATEGORIES:
                    return jsonify({"message": "Select a valid senior citizen category."}), 400
                payload[col] = data[key]
            elif key == "monthlyIncome":
                if data[key] is None or data[key] == "":
                    payload[col] = None
                else:
                    try:
                        income = Decimal(str(data[key]))
                        if not income.is_finite() or income < 0 or income > Decimal("9999999999.99"):
                            raise ValueError()
                        payload[col] = str(income.quantize(Decimal("0.01")))
                    except (InvalidOperation, ValueError):
                        return jsonify({"message": "Monthly income must be a non-negative amount."}), 400
            elif key == "children":
                if not isinstance(data[key], list):
                    return jsonify({"message": "Children must be a list."}), 400
                payload[col] = data[key]
            else:
                val = data[key]
                payload[col] = (str(val).strip() or None) if val is not None else None

    # Handle digital signature fields
    sig_val = data.get("digitalSignature") or data.get("signature")
    if sig_val is not None:
        try:
            saved = supabase_rest("PATCH", "seniors", params={"user_id": f"eq.{user_id}"},
                                  payload={"signature": str(sig_val).strip()})
            # PATCH responses are empty unless return=representation is requested;
            # verify the linked profile before treating the save as successful.
            linked = supabase_rest("GET", "seniors", params={"user_id": f"eq.{user_id}", "select": "user_id", "limit": "1"})
            if not linked:
                return jsonify({"message": "Senior profile not found."}), 404
        except RuntimeError as exc:
            return jsonify({"message": str(exc)}), 500

    if "email" in payload and payload["email"]:
        payload["email"] = payload["email"].lower()

    if "address" in data or any(k in data for k in ["houseNo", "street", "subdivision", "barangay"]):
        payload["address"] = normalize_address(data)

    if not payload:
        if senior_income is not None:
            supabase_rest("PATCH", "seniors", params={"user_id": f"eq.{user_id}"}, payload=senior_income)
        if sig_val is not None or senior_income is not None:
            rows = supabase_rest("GET", SUPABASE_USERS_TABLE, params={"id": f"eq.{user_id}", "select": "*", "limit": "1"})
            return jsonify({"message": "Profile updated.", "user": _serialize_user(rows[0])}), 200
        return jsonify({"message": "No fields to update."}), 400

    try:
        url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_USERS_TABLE}"
        headers = _rest_headers(prefer_return=True)
        resp = requests.patch(url, headers=headers, params={"id": f"eq.{user_id}"}, json=payload, timeout=15)
        
        # If patching birth_certificate failed due to column name mismatch, try 'birthcert'
        if not resp.ok and "birth_certificate" in payload:
            alt_payload_bc = dict(payload)
            bc_content = alt_payload_bc.pop("birth_certificate")
            alt_payload_bc["birthcert"] = bc_content
            resp = requests.patch(url, headers=headers, params={"id": f"eq.{user_id}"}, json=alt_payload_bc, timeout=15)

        if not resp.ok:
            detail = resp.json().get("message", resp.text) if resp.content else resp.text
            return jsonify({"message": f"Update failed: {detail}"}), 500
        updated = resp.json()
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500

    if senior_income is not None:
        try:
            supabase_rest("PATCH", "seniors", params={"user_id": f"eq.{user_id}"}, payload=senior_income)
        except RuntimeError as exc:
            return jsonify({"message": str(exc)}), 500
    u = updated[0] if updated else {}
    u = with_senior_fields([u], supabase_rest)[0] if u else u
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

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{file_path}?v={int(time.time())}"

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


@app.route("/api/user/<int:user_id>/birthcert", methods=["POST", "DELETE", "OPTIONS"])
def upload_birth_certificate(user_id):
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "DELETE":
        try:
            patch_url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_USERS_TABLE}"
            headers = _rest_headers(prefer_return=True)
            patch_response = requests.patch(
                patch_url,
                headers=headers,
                params={"id": f"eq.{user_id}"},
                json={"birth_certificate": None},
                timeout=15,
            )
            if not patch_response.ok:
                patch_response = requests.patch(
                    patch_url,
                    headers=headers,
                    params={"id": f"eq.{user_id}"},
                    json={"birthcert": None},
                    timeout=15,
                )
            if not patch_response.ok:
                detail = patch_response.json().get("message", patch_response.text) if patch_response.content else patch_response.text
                return jsonify({"message": f"Could not remove birth certificate: {detail}"}), 500

            # Try cleaning up storage file as well
            try:
                for ext in [".pdf", ".png", ".jpg"]:
                    file_path = f"user_{user_id}/birth_certificate{ext}"
                    storage_del_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{file_path}"
                    requests.delete(
                        storage_del_url,
                        headers={
                            "apikey": SUPABASE_SERVICE_ROLE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                        },
                        timeout=10,
                    )
            except Exception:
                pass

            return jsonify({
                "message": "Birth certificate removed successfully.",
                "birthcert": None,
                "birth_certificate": None,
                "birthCertificate": None,
            }), 200
        except Exception as exc:
            return jsonify({"message": str(exc)}), 500

    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image") or ""
    mime_type = str(data.get("mimeType") or "").lower()
    file_name = str(data.get("fileName") or "birth_certificate")
    allowed_types = {"application/pdf", "image/png", "image/jpeg", "image/jpg"}
    if mime_type not in allowed_types:
        return jsonify({"message": "Birth certificate must be a PDF, PNG, or JPG file."}), 400
    if not image_b64:
        return jsonify({"message": "No birth certificate file provided."}), 400

    try:
        clean_b64 = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64
        file_bytes = base64.b64decode(clean_b64.strip())
        extension = ".pdf" if mime_type == "application/pdf" else ".png" if mime_type == "image/png" else ".jpg"
        file_path = f"user_{user_id}/birth_certificate{extension}"
        storage_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{file_path}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": mime_type,
            "x-upsert": "true",
        }
        response = requests.put(storage_url, headers=headers, data=file_bytes, timeout=30)
        if not response.ok:
            return jsonify({"message": f"Birth certificate upload failed: {response.text or response.reason}"}), 500

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{file_path}?v={int(time.time())}"
        patch_url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_USERS_TABLE}"
        headers = _rest_headers(prefer_return=True)

        # Try 'birth_certificate' first (the actual column in Supabase), fallback to 'birthcert'
        patch_response = requests.patch(
            patch_url,
            headers=headers,
            params={"id": f"eq.{user_id}"},
            json={"birth_certificate": public_url},
            timeout=15,
        )
        if not patch_response.ok:
            patch_response = requests.patch(
                patch_url,
                headers=headers,
                params={"id": f"eq.{user_id}"},
                json={"birthcert": public_url},
                timeout=15,
            )

        if not patch_response.ok:
            detail = patch_response.json().get("message", patch_response.text) if patch_response.content else patch_response.text
            return jsonify({"message": f"Could not save birth certificate: {detail}"}), 500

        return jsonify({
            "birthcert": public_url,
            "birth_certificate": public_url,
            "birthCertificate": public_url,
        }), 200
    except (ValueError, base64.binascii.Error):
        return jsonify({"message": "Invalid birth certificate file data."}), 400
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500


# ---------------------------------------------------------------------------
# Digital Signature Upload / Save
# ---------------------------------------------------------------------------

@app.route("/api/user/<int:user_id>/signature", methods=["POST", "OPTIONS"])
def save_digital_signature(user_id):
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        ensure_users_table()
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500

    data = request.get_json(silent=True) or {}
    signature_data = data.get("signature") or data.get("digitalSignature") or data.get("image") or ""

    if not signature_data:
        return jsonify({"message": "No signature data provided."}), 400

    try:
        profiles = supabase_rest("GET", "seniors", params={"user_id": f"eq.{user_id}", "select": "user_id", "limit": "1"})
        if not profiles:
            return jsonify({"message": "Senior profile not found."}), 404
        supabase_rest("PATCH", "seniors", params={"user_id": f"eq.{user_id}"}, payload={"signature": signature_data})
        users = supabase_rest("GET", SUPABASE_USERS_TABLE, params={"id": f"eq.{user_id}", "select": "*", "limit": "1"})
        return jsonify({"success": True, "message": "Digital signature saved successfully!",
                        "signature": signature_data, "user": _serialize_user(users[0]) if users else {}}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500



# ---------------------------------------------------------------------------
# Admin — Users & Transactions
# ---------------------------------------------------------------------------

ADMIN_ROLES = {"osca admin", "med admin", "super admin"}
MANAGED_ROLES = {"user", "senior", "senior citizen", "osca admin", "med admin", "health center", "super admin"}


def write_audit_log(actor, action, entity_type, entity_id=None, details=None):
    actor_name = " ".join(filter(None, [actor.get("firstName"), actor.get("lastName")])) or actor.get("email")
    try:
        supabase_rest("POST", "audit_logs", payload={
            "actor_user_id": actor.get("id"),
            "actor_name": actor_name,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id is not None else None,
            "details": details or {},
        })
    except RuntimeError:
        app.logger.exception("Could not write audit log for %s", action)


def fetch_admin_rows(table, select="*"):
    return supabase_rest("GET", table, params={"select": select, "order": "created_at.desc"})


def require_admin_session(allowed_roles=ADMIN_ROLES):
    session, status = current_session()
    if status != 200:
        return None, (session, status)
    user = session.get_json().get("user", {})
    role = str(user.get("role") or "").strip().lower()
    if role not in allowed_roles:
        return None, (jsonify({"message": "Administrator access is required."}), 403)
    return user, None


@app.route("/api/admin/service-records", methods=["GET", "OPTIONS"])
def admin_service_records():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        session, status = current_session()
        if status != 200:
            return session, status
        role = str(session.get_json()["user"].get("role") or "").strip().lower()
        if role not in {"osca admin", "super admin"}:
            return jsonify({"message": "Administrator access is required."}), 403
        return jsonify({"records": service_records(supabase_rest, SUPABASE_USERS_TABLE)}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/admin/seniors/export", methods=["POST", "OPTIONS"])
def export_senior_table():
    if request.method == "OPTIONS":
        return ("", 204)
    session, status = current_session()
    if status != 200:
        return session, status
    role = str(session.get_json()["user"].get("role") or "").strip().lower()
    if role not in {"osca admin", "super admin"}:
        return jsonify({"message": "Administrator access is required."}), 403
    data = request.get_json(silent=True) or {}
    format_name = data.get("format")
    if format_name not in {"pdf", "xlsx"}:
        return jsonify({"message": "Choose PDF or Excel export."}), 400
    try:
        from services.senior_exports import export_pdf, export_excel
        output = export_pdf(data) if format_name == "pdf" else export_excel(data)
        mime = "application/pdf" if format_name == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        response = send_file(output, mimetype=mime, as_attachment=True,
                             download_name=f"senior-citizens.{format_name}")
        response.headers["Cache-Control"] = "no-store"
        return response
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except Exception:
        app.logger.exception("Senior registry export failed")
        return jsonify({"message": "Could not generate the export. Please try again."}), 500


@app.route("/api/admin/users", methods=["GET", "OPTIONS"])
def admin_users():
    if request.method == "OPTIONS":
        return ("", 204)
    actor, error = require_admin_session({"osca admin", "super admin"})
    if error:
        return error
    try:
        ensure_users_table()
        # Fetch every page and serialize only public profile fields. Selecting all
        # columns includes income/category fields omitted by the login projection.
        result = []
        while True:
            page = supabase_rest(
                "GET", SUPABASE_USERS_TABLE,
                params={"select": "*", "order": "created_at.desc,id.desc",
                        "limit": "100", "offset": str(len(result))},
            )
            result.extend(page)
            if len(page) < 100:
                break
        return jsonify({"users": [_serialize_user(u) for u in result]}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/admin/users/<int:user_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def manage_admin_user(user_id):
    if request.method == "OPTIONS":
        return ("", 204)
    actor, error = require_admin_session({"super admin"})
    if error:
        return error
    if actor.get("id") == user_id:
        return jsonify({"message": "You cannot deactivate, change, or delete your own account."}), 400
    try:
        current = supabase_rest("GET", SUPABASE_USERS_TABLE, params={"select": "*", "id": f"eq.{user_id}", "limit": "1"})
        if not current:
            return jsonify({"message": "User not found."}), 404
        target = current[0]
        if request.method == "DELETE":
            supabase_rest("DELETE", SUPABASE_USERS_TABLE, params={"id": f"eq.{user_id}"})
            write_audit_log(actor, "deleted user account", "user", user_id, {"email": target.get("email")})
            return jsonify({"message": "User account deleted."}), 200
        data = request.get_json(silent=True) or {}
        payload = {}
        if "status" in data:
            status = str(data["status"]).strip()
            if status not in {"Active", "Inactive", "Suspended"}:
                return jsonify({"message": "Invalid account status."}), 400
            payload["status"] = status
        if "role" in data:
            role = str(data["role"]).strip().lower()
            if role not in MANAGED_ROLES:
                return jsonify({"message": "Invalid user role."}), 400
            payload["role"] = role
        if not payload:
            return jsonify({"message": "No account changes were provided."}), 400
        updated = supabase_rest("PATCH", SUPABASE_USERS_TABLE, params={"id": f"eq.{user_id}"},
                                payload=payload)
        write_audit_log(actor, "updated user account", "user", user_id, {
            "email": target.get("email"), "changes": payload,
        })
        return jsonify({"user": _serialize_user(updated[0] if updated else {**target, **payload})}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/admin/transactions", methods=["GET", "OPTIONS"])
def admin_transactions():
    if request.method == "OPTIONS":
        return ("", 204)
    _, error = require_admin_session({"super admin"})
    if error:
        return error
    try:
        category = str(request.args.get("category") or "all").strip().lower()
        birthday = supabase_rest("GET", "octogenarian_benefit_applications", params={
            "select": "id,benefit_type,benefit_status,validation_status,created_at",
            "order": "created_at.desc",
        })
        cinema = supabase_rest("GET", "movie_reservations", params={
            "select": "id,status,created_at,screening_id",
            "order": "created_at.desc",
        })
        records = []
        if category in {"all", "birthday"}:
            records.extend([{**row, "category": "birthday"} for row in birthday])
        if category in {"all", "cinema"}:
            records.extend([{**row, "category": "cinema"} for row in cinema])
        records.sort(key=lambda row: row.get("created_at") or "", reverse=True)
        stats = {
            "total": len(records),
            "completed": sum(1 for row in records if str(row.get("benefit_status") or row.get("status") or "").lower() in {"released", "confirmed", "completed"}),
            "pending": sum(1 for row in records if str(row.get("benefit_status") or row.get("status") or "").lower() in {"pending", "for processing"}),
            "byCategory": {
                "birthday": sum(1 for row in records if row["category"] == "birthday"),
                "cinema": sum(1 for row in records if row["category"] == "cinema"),
            },
        }
        return jsonify({"transactions": records, "stats": stats, "category": category}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/admin/feedback", methods=["GET", "OPTIONS"])
def admin_feedback():
    if request.method == "OPTIONS":
        return ("", 204)
    _, error = require_admin_session({"super admin"})
    if error:
        return error
    try:
        return jsonify({"feedback": supabase_rest("GET", "service_feedback", params={
            "select": "*,users(first_name,last_name,email)",
            "order": "created_at.desc",
        })}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/announcements", methods=["GET", "POST", "OPTIONS"])
def announcements():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        try:
            return jsonify({"announcements": supabase_rest("GET", "announcements", params={
                "select": "*", "published": "eq.true", "order": "created_at.desc",
            })}), 200
        except RuntimeError as exc:
            return jsonify({"message": str(exc)}), 503

    user, error = require_admin_session({"osca admin", "super admin"})
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title") or "").strip()
    body = str(payload.get("body") or "").strip()
    image_url = payload.get("image_url")
    if image_url is not None:
        image_url = str(image_url).strip() or None
    if image_url and len(image_url) > 3_000_000:
        return jsonify({"message": "Announcement images must be smaller than 2 MB."}), 400
    if not title or len(title) > 160 or not body or len(body) > 5000:
        return jsonify({"message": "Enter a title and announcement text within the allowed limits."}), 400
    try:
        created = supabase_rest("POST", "announcements", payload={
            "title": title, "body": body, "image_url": image_url, "published": bool(payload.get("published", True)),
            "created_by": user["id"],
        })
        return jsonify({"announcement": created[0] if isinstance(created, list) and created else created}), 201
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 503


@app.route("/api/announcements/<announcement_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def update_announcement(announcement_id):
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session({"osca admin", "super admin"})
    if error:
        return error
    try:
        if request.method == "DELETE":
            supabase_rest("DELETE", "announcements", params={"id": f"eq.{announcement_id}"})
            return jsonify({"message": "Announcement deleted."}), 200
        payload = request.get_json(silent=True) or {}
        update = {}
        if "title" in payload:
            update["title"] = str(payload.get("title") or "").strip()
        if "body" in payload:
            update["body"] = str(payload.get("body") or "").strip()
        if "image_url" in payload:
            image_url = payload.get("image_url")
            update["image_url"] = str(image_url).strip() if image_url else None
            if update["image_url"] and len(update["image_url"]) > 3_000_000:
                return jsonify({"message": "Announcement images must be smaller than 2 MB."}), 400
        if "published" in payload:
            update["published"] = bool(payload["published"])
        if not update or (not update.get("title", "valid") or not update.get("body", "valid")):
            return jsonify({"message": "Provide valid announcement fields."}), 400
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        updated = supabase_rest("PATCH", "announcements", params={"id": f"eq.{announcement_id}"}, payload=update)
        return jsonify({"announcement": updated[0] if isinstance(updated, list) and updated else updated}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 503


@app.route("/api/feedback", methods=["POST", "OPTIONS"])
def submit_service_feedback():
    if request.method == "OPTIONS":
        return ("", 204)
    session_response, session_status = current_session()
    if session_status != 200:
        return session_response, session_status
    session_user = (session_response.get_json(silent=True) or {}).get("user") or {}
    payload = request.get_json(silent=True) or {}
    try:
        rating = int(payload.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"message": "Choose a rating from 1 to 5 stars."}), 400
    comments = str(payload.get("comments") or "").strip()
    if rating < 1 or rating > 5:
        return jsonify({"message": "Choose a rating from 1 to 5 stars."}), 400
    if not comments or len(comments) > 2000:
        return jsonify({"message": "Enter feedback between 1 and 2000 characters."}), 400
    try:
        rows = supabase_rest("POST", "service_feedback", payload={
            "user_id": session_user.get("id"),
            "service_key": "system",
            "service_record_id": str(payload.get("service_record_id") or f"dashboard-{int(datetime.now(timezone.utc).timestamp() * 1000)}"),
            "rating": rating,
            "comments": comments,
        })
        return jsonify({"feedback": rows[0] if isinstance(rows, list) and rows else rows}), 201
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 503


@app.route("/api/admin/audit-logs", methods=["GET", "OPTIONS"])
def admin_audit_logs():
    if request.method == "OPTIONS":
        return ("", 204)
    _, error = require_admin_session({"super admin"})
    if error:
        return error
    try:
        return jsonify({"logs": supabase_rest("GET", "audit_logs", params={
            "select": "*", "order": "created_at.desc",
        })}), 200
    except RuntimeError as exc:
        if "audit_logs" in str(exc):
            app.logger.warning("Audit log table is unavailable; returning an empty audit log.")
            return jsonify({"logs": []}), 200
        return jsonify({"message": str(exc)}), 500


@app.route("/api/issues", methods=["GET", "POST", "OPTIONS"])
def issue_reports():
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session(ADMIN_ROLES) if request.method == "GET" else require_admin_session(
        {"user", "senior", "senior citizen", *ADMIN_ROLES}
    )
    if error:
        return error
    try:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            subject = str(data.get("subject") or "").strip()
            description = str(data.get("description") or "").strip()
            category = str(data.get("category") or "general").strip()[:40]
            if len(subject) < 3 or not description:
                return jsonify({"message": "Subject and description are required."}), 400
            created = supabase_rest("POST", "issue_reports", payload={
                "user_id": user["id"], "category": category or "general",
                "subject": subject[:160], "description": description[:5000],
            })
            return jsonify({"issue": created[0] if created else {}}), 201
        role = str(user.get("role") or "").lower()
        params = {"select": "*,users(first_name,last_name,email)", "order": "created_at.desc"}
        if role not in ADMIN_ROLES:
            params["user_id"] = f"eq.{user['id']}"
        return jsonify({"issues": supabase_rest("GET", "issue_reports", params=params)}), 200
    except RuntimeError as exc:
        if "issue_reports" in str(exc):
            app.logger.warning("Issue reports table is unavailable; returning an empty issue list.")
            return jsonify({"issues": []}), 200
        return jsonify({"message": str(exc)}), 500


@app.route("/api/admin/issues/<issue_id>", methods=["PATCH", "OPTIONS"])
def update_issue(issue_id):
    if request.method == "OPTIONS":
        return ("", 204)
    _, error = require_admin_session({"super admin"})
    if error:
        return error
    status = str((request.get_json(silent=True) or {}).get("status") or "").strip()
    if status not in {"open", "in_progress", "resolved", "closed"}:
        return jsonify({"message": "Invalid issue status."}), 400
    try:
        updated = supabase_rest("PATCH", "issue_reports", params={"id": f"eq.{issue_id}"},
                                payload={"status": status, "updated_at": datetime.utcnow().isoformat()})
        return jsonify({"issue": updated[0] if updated else {}}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/community/posts", methods=["GET", "POST", "OPTIONS"])
def community_posts():
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session({"user", "senior", "senior citizen", *ADMIN_ROLES})
    if error:
        return error
    try:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            title = str(data.get("title") or "").strip()
            body = str(data.get("body") or "").strip()
            if not body:
                return jsonify({"message": "A message is required."}), 400
            if not title:
                title = "Community post"
            created = supabase_rest("POST", "community_posts", payload={
                "user_id": user["id"], "title": title[:160], "body": body[:5000],
            })
            return jsonify({"post": created[0] if created else {}}), 201
        posts = supabase_rest("GET", "community_posts", params={
            "select": "*", "order": "created_at.desc",
        })
        if isinstance(posts, dict):
            posts = [posts]
        if not isinstance(posts, list):
            raise RuntimeError("Community posts returned an invalid response.")
        posts = [
            post for post in posts
            if isinstance(post, dict) and post.get("id")
            and str(post.get("status") or "published") == "published"
        ]
        for post in posts:
            post_id = post["id"]
            try:
                post["comments"] = supabase_rest("GET", "community_comments", params={
                    "select": "*,users(first_name,last_name)", "post_id": f"eq.{post_id}",
                    "order": "created_at.asc",
                })
            except RuntimeError as exc:
                app.logger.warning("Community comments unavailable: %s", exc)
                post["comments"] = []
            try:
                likes = supabase_rest("GET", "community_post_likes", params={
                    "select": "user_id", "post_id": f"eq.{post_id}",
                })
            except RuntimeError as exc:
                app.logger.warning("Community likes unavailable: %s", exc)
                likes = []
            if isinstance(likes, dict):
                likes = [likes]
            if not isinstance(likes, list):
                likes = []
            post["likes_count"] = len(likes)
            post["liked_by_me"] = any(row.get("user_id") == user["id"] for row in likes)
        return jsonify({"posts": posts}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


def community_user_can_edit(table, item_id, user_id):
    rows = supabase_rest("GET", table, params={"id": f"eq.{item_id}", "select": "user_id", "limit": "1"})
    return bool(rows and rows[0].get("user_id") == user_id)


@app.route("/api/community/posts/<post_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def update_community_post(post_id):
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session({"user", "senior", "senior citizen", *ADMIN_ROLES})
    if error:
        return error
    try:
        if not community_user_can_edit("community_posts", post_id, user["id"]):
            return jsonify({"message": "You can only change your own posts."}), 403
        if request.method == "DELETE":
            supabase_rest("DELETE", "community_posts", params={"id": f"eq.{post_id}"})
            return jsonify({"message": "Post deleted."}), 200
        body = str((request.get_json(silent=True) or {}).get("body") or "").strip()
        if not body:
            return jsonify({"message": "A message is required."}), 400
        updated = supabase_rest("PATCH", "community_posts", params={"id": f"eq.{post_id}"}, payload={
            "body": body[:5000], "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return jsonify({"post": updated[0] if updated else {}}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/community/posts/<post_id>/comments", methods=["POST", "OPTIONS"])
def create_community_comment(post_id):
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session({"user", "senior", "senior citizen", *ADMIN_ROLES})
    if error:
        return error
    body = str((request.get_json(silent=True) or {}).get("body") or "").strip()
    if not body:
        return jsonify({"message": "A comment is required."}), 400
    try:
        created = supabase_rest("POST", "community_comments", payload={
            "post_id": post_id, "user_id": user["id"], "body": body[:2000],
        })
        return jsonify({"comment": created[0] if created else {}}), 201
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/community/comments/<comment_id>", methods=["PATCH", "DELETE", "OPTIONS"])
def update_community_comment(comment_id):
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session({"user", "senior", "senior citizen", *ADMIN_ROLES})
    if error:
        return error
    try:
        if not community_user_can_edit("community_comments", comment_id, user["id"]):
            return jsonify({"message": "You can only change your own comments."}), 403
        if request.method == "DELETE":
            supabase_rest("DELETE", "community_comments", params={"id": f"eq.{comment_id}"})
            return jsonify({"message": "Comment deleted."}), 200
        body = str((request.get_json(silent=True) or {}).get("body") or "").strip()
        if not body:
            return jsonify({"message": "A comment is required."}), 400
        updated = supabase_rest("PATCH", "community_comments", params={"id": f"eq.{comment_id}"}, payload={
            "body": body[:2000], "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return jsonify({"comment": updated[0] if updated else {}}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


@app.route("/api/community/posts/<post_id>/like", methods=["POST", "OPTIONS"])
def toggle_community_like(post_id):
    if request.method == "OPTIONS":
        return ("", 204)
    user, error = require_admin_session({"user", "senior", "senior citizen", *ADMIN_ROLES})
    if error:
        return error
    try:
        existing = supabase_rest("GET", "community_post_likes", params={
            "post_id": f"eq.{post_id}", "user_id": f"eq.{user['id']}", "select": "post_id",
        })
        if existing:
            supabase_rest("DELETE", "community_post_likes", params={
                "post_id": f"eq.{post_id}", "user_id": f"eq.{user['id']}",
            })
            liked = False
        else:
            supabase_rest("POST", "community_post_likes", payload={"post_id": post_id, "user_id": user["id"]})
            liked = True
        likes = supabase_rest("GET", "community_post_likes", params={
            "post_id": f"eq.{post_id}", "select": "user_id",
        })
        return jsonify({"liked": liked, "likes_count": len(likes)}), 200
    except RuntimeError as exc:
        return jsonify({"message": str(exc)}), 500


# ---------------------------------------------------------------------------
# AI Companion & eGov AI Services
# ---------------------------------------------------------------------------

@app.route("/api/assistant/chat", methods=["POST", "OPTIONS"])
def assistant_chat():
    """
    Conversational AI Assistant (Kuya A / Lolo Aurea).
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    message = data.get("message") or data.get("text") or ""
    history = data.get("history") or []
    user_profile = data.get("user_profile") or data.get("user") or {}

    if not message.strip():
        return jsonify({"text": "Kumusta po! Ano po ang maipaglilingkod ko sa inyo?", "action": None}), 200

    try:
        response_data = assistant_service.generate_assistant_response(
            message=message,
            history=history,
            user_profile=user_profile
        )
        return jsonify(response_data), 200
    except Exception as exc:
        print(f"[AUREA AI] Chat error: {exc}")
        return jsonify({
            "text": "Magandang araw po! Handa po akong tumulong sa inyo. Pakisubukang muli ang inyong tanong.",
            "action": None
        }), 200


@app.route("/api/assistant/extract-document", methods=["POST", "OPTIONS"])
def assistant_extract_document():
    """
    Multimodal Document Extractor (Senior ID, Medical Prescription, Barangay Clearance).
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image") or ""
    mime_type = data.get("mimeType") or "image/jpeg"

    if not image_b64:
        return jsonify({"success": False, "message": "No document image provided."}), 400

    try:
        res = assistant_service.extract_document_text(image_b64, mime_type)
        return jsonify(res), 200
    except Exception as exc:
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/assistant/identify-image", methods=["POST", "OPTIONS"])
def assistant_identify_image():
    """
    Multimodal Image Identifier (Pills/Medicine, Bills, Receipts, Senior Documents).
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image") or ""
    mime_type = data.get("mimeType") or "image/jpeg"

    if not image_b64:
        return jsonify({"success": False, "message": "No image provided for identification."}), 400

    try:
        res = assistant_service.identify_image_content(image_b64, mime_type)
        return jsonify(res), 200
    except Exception as exc:
        return jsonify({"success": False, "message": str(exc)}), 500


# ---------------------------------------------------------------------------
# LOLO AUREA — Register AI Companion Routes (Phase 2+)
# ---------------------------------------------------------------------------

register_lolo_routes(app)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    print("[AUREA] Starting backend...")
    print("[AUREA] LOLO AUREA AI Companion routes registered.")

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
