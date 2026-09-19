import base64
import mimetypes
from datetime import date, datetime

from flask import Blueprint, jsonify, request
import requests

from config import Config
from services.memory_service import _supabase

benefit_applications_bp = Blueprint(
    "benefit_applications",
    __name__,
    url_prefix="/api/benefit-applications",
)

APPLICANT_FIELDS = {
    "osca_id_number",
    "benefit_type",
    "date_of_birth",
    "date_of_application",
    "residential_address",
    "permanent_address_philippines",
    "spouse_name",
    "spouse_citizenship",
    "representative_name",
    "representative_relationship",
    "contact_number",
    "email_address",
    "citizenship",
    "is_dual_citizen",
    "dual_citizenship_details",
    "full_body_picture_submitted",
    "endorsed_list_submitted",
    "full_body_picture_url",
    "endorsed_list_url",
    "applicant_signature",
    "applicant_signature_date",
}


def upload_benefit_document(user_id: int, document_type: str, image_b64: str, mime_type: str) -> str:
    clean_b64 = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64
    try:
        image_bytes = base64.b64decode(clean_b64.strip())
    except Exception as exc:
        raise ValueError(f"Invalid {document_type} attachment.") from exc

    extension = mimetypes.guess_extension(mime_type) or ".jpg"
    if extension == ".jpe":
        extension = ".jpg"
    file_path = f"user_{user_id}/benefits/{document_type}{extension}"
    storage_url = f"{Config.SUPABASE_URL}/storage/v1/object/{Config.SUPABASE_STORAGE_BUCKET}/{file_path}"
    response = requests.put(
        storage_url,
        headers={
            "apikey": Config.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {Config.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": mime_type,
            "x-upsert": "true",
        },
        data=image_bytes,
        timeout=30,
    )
    if not response.ok:
        raise RuntimeError(f"Could not upload {document_type} attachment: {response.text}")
    return f"{Config.SUPABASE_URL}/storage/v1/object/public/{Config.SUPABASE_STORAGE_BUCKET}/{file_path}"


def classify_benefit_type(date_of_birth: str) -> str | None:
    try:
        normalized_date = str(date_of_birth or "").strip()
        try:
            birth_date = datetime.strptime(normalized_date, "%Y-%m-%d").date()
        except ValueError:
            birth_date = datetime.strptime(normalized_date, "%m/%d/%Y").date()
    except (TypeError, ValueError):
        return None

    today = date.today()
    if birth_date > today:
        return None
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )
    if age >= 100:
        return "Centenarian"
    if age >= 90:
        return "Nonagenarian"
    if age >= 80:
        return "Octogenarian"
    return None


@benefit_applications_bp.route("", methods=["POST", "OPTIONS"])
def create_benefit_application():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    try:
        user_id = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "user_id is required."}), 400

    try:
        users = _supabase(
            "GET",
            "users",
            params={"select": "id", "id": f"eq.{user_id}", "limit": "1"},
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    if not isinstance(users, list) or not users:
        return jsonify({"success": False, "error": "Applicant was not found."}), 404

    date_of_birth = str(data.get("date_of_birth") or "").strip()
    benefit_type = classify_benefit_type(date_of_birth)
    if not date_of_birth:
        return jsonify({"success": False, "error": "date_of_birth is required."}), 400

    if not benefit_type:
        return jsonify({
            "success": False,
            "error": "The applicant must be at least 80 years old for this benefit.",
        }), 400

    required = ("permanent_address_philippines", "contact_number", "email_address")
    if any(not str(data.get(field) or "").strip() for field in required):
        return jsonify({"success": False, "error": "Please complete the required application fields."}), 400

    full_body_picture = str(data.get("full_body_picture_base64") or "").strip()
    endorsed_list = str(data.get("endorsed_list_base64") or "").strip()
    if not full_body_picture:
        return jsonify({"success": False, "error": "Full-body picture attachment is required."}), 400

    payload = {field: data[field] for field in APPLICANT_FIELDS if field in data}
    payload["user_id"] = user_id
    payload["osca_id_number"] = f"SA-{user_id:04d}"
    payload["benefit_type"] = benefit_type
    payload["full_body_picture_submitted"] = True
    payload["endorsed_list_submitted"] = bool(endorsed_list)

    try:
        payload["full_body_picture_url"] = upload_benefit_document(
            user_id,
            "full_body_picture",
            full_body_picture,
            str(data.get("full_body_picture_mime_type") or "image/jpeg"),
        )
        if endorsed_list:
            payload["endorsed_list_url"] = upload_benefit_document(
                user_id,
                "endorsed_list",
                endorsed_list,
                str(data.get("endorsed_list_mime_type") or "image/jpeg"),
            )
        created = _supabase(
            "POST",
            "octogenarian_benefit_applications",
            payload=payload,
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    application = created[0] if isinstance(created, list) and created else created
    return jsonify({"success": True, "application": application}), 201


@benefit_applications_bp.route("/admin", methods=["GET", "OPTIONS"])
def list_admin_benefit_applications():
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        applications = _supabase(
            "GET",
            "octogenarian_benefit_applications",
            params={"select": "*", "order": "created_at.desc"},
        )
        users = _supabase(
            "GET",
            "users",
            params={"select": "id,first_name,middle_name,last_name,email,contact,avatar_url,birth_certificate", "limit": "10000"},
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    user_map = {str(user.get("id")): user for user in users if user.get("id") is not None}
    result = []
    for application in applications:
        user = user_map.get(str(application.get("user_id")), {})
        birth_cert_url = user.get("birth_certificate") or user.get("birthcert") or None
        has_digital_id = user.get("id") is not None
        has_account_picture = bool(user.get("avatar_url"))
        has_birth_certificate = bool(birth_cert_url)
        result.append({
            **application,
            "birth_certificate_submitted": bool(application.get("birth_certificate_submitted") or has_birth_certificate),
            "birth_certificate_url": birth_cert_url,
            "valid_id_submitted": bool(application.get("valid_id_submitted") or has_digital_id),
            "id_picture_submitted": bool(application.get("id_picture_submitted") or has_account_picture),
            "id_picture_url": user.get("avatar_url") or None,
            "applicant": {
                "firstName": user.get("first_name") or "",
                "middleName": user.get("middle_name") or "",
                "lastName": user.get("last_name") or "",
                "email": user.get("email") or application.get("email_address") or "",
                "contact": user.get("contact") or application.get("contact_number") or "",
            },
        })

    return jsonify({"success": True, "applications": result}), 200


@benefit_applications_bp.route("/admin/<application_id>", methods=["PATCH", "OPTIONS"])
def update_admin_benefit_application(application_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    allowed = {"validation_status", "benefit_status", "findings_concerns_recommendations", "benefit_amount"}
    payload = {key: data[key] for key in allowed if key in data}
    if not payload:
        return jsonify({"success": False, "error": "No review fields to update."}), 400

    if "validation_status" in payload and payload["validation_status"] not in {"Pending", "Under Review", "Eligible", "Ineligible", "Approved", "Rejected"}:
        return jsonify({"success": False, "error": "Invalid validation status."}), 400
    if "benefit_status" in payload and payload["benefit_status"] not in {"Pending", "For Processing", "Approved", "Released", "Cancelled"}:
        return jsonify({"success": False, "error": "Invalid benefit status."}), 400

    try:
        updated = _supabase(
            "PATCH",
            f"octogenarian_benefit_applications?id=eq.{application_id}",
            payload=payload,
        )
        updated = _supabase(
            "GET",
            "octogenarian_benefit_applications",
            params={"select": "*", "id": f"eq.{application_id}", "limit": "1"},
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    application = updated[0] if isinstance(updated, list) and updated else updated
    return jsonify({"success": True, "application": application}), 200
