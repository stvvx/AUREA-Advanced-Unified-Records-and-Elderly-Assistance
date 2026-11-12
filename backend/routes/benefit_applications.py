import base64
import mimetypes
import re
from datetime import date, datetime

from flask import Blueprint, jsonify, request
import requests

from services.senior_ids import format_senior_id
from config import Config
from services.memory_service import _supabase

benefit_applications_bp = Blueprint(
    "benefit_applications",
    __name__,
    url_prefix="/api/benefit-applications",
)

APPLICANT_FIELDS = {
    "ncsc_registration_reference_number",
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


def missing_schema_column(error: Exception) -> str | None:
    message = str(error).lower()
    if "column" not in message and "schema cache" not in message:
        return None

    match = re.search(
        r"(?:could not find the ['\"]?([a-z0-9_]+)['\"]? column|"
        r"column ['\"]?([a-z0-9_]+)['\"]?)",
        message,
    )
    return next((value for value in match.groups() if value), None) if match else None


def birthday_benefit_milestone(dob, on_date=None):
    try:
        try:
            birth = datetime.strptime(str(dob).strip(), "%Y-%m-%d").date()
        except ValueError:
            birth = datetime.strptime(str(dob).strip(), "%m/%d/%Y").date()
        today = date.fromisoformat(str(on_date)[:10]) if on_date else date.today()
        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
        return next((milestone for milestone in (100, 95, 90, 85, 80) if age >= milestone), None)
    except (ValueError, TypeError):
        return None


def application_milestone(application, dob):
    if application.get("benefit_milestone") in (80, 85, 90, 95, 100):
        return application["benefit_milestone"]
    return birthday_benefit_milestone(dob, application.get("date_of_application") or application.get("created_at")) if (application.get("date_of_application") or application.get("created_at")) else {"Octogenarian": 80, "Nonagenarian": 90, "Centenarian": 100}.get(application.get("benefit_type"))


def birthday_application_eligibility(dob, applications, reviewed_ids):
    benefit_type = classify_benefit_type(dob)
    if not benefit_type:
        return {"can_apply": False, "benefit_type": None, "message": "You are not yet eligible for a birthday benefit."}
    if any(item.get("benefit_status") != "Released" for item in applications):
        return {"can_apply": False, "benefit_type": benefit_type, "message": "Track your existing application until your benefit is released."}
    # The tracking view and feedback requirement both refer to the latest application.
    if applications and str(applications[0].get("id")) not in reviewed_ids:
        return {"can_apply": False, "benefit_type": benefit_type, "message": "Submit feedback for your released benefit before applying again."}
    milestone = birthday_benefit_milestone(dob)
    if any(application_milestone(item, dob) == milestone for item in applications):
        next_age = {80: 85, 85: 90, 90: 95, 95: 100}.get(milestone)
        message = f"You may apply for your next birthday benefit when you turn {next_age}." if next_age else "You have already applied for the Centenarian benefit."
        return {"can_apply": False, "benefit_type": benefit_type, "message": message}
    return {"can_apply": True, "benefit_type": benefit_type, "message": f"You are eligible to apply for the age {milestone} birthday benefit."}


def load_birthday_eligibility(user_id, dob, applications):
    feedback = _supabase("GET", "service_feedback", params={
        "user_id": f"eq.{user_id}", "service_key": "eq.birthday_benefits", "select": "*",
    }) if applications else []
    result = birthday_application_eligibility(dob, applications, {str(row["service_record_id"]) for row in (feedback or [])})
    latest_id = str(applications[0].get("id")) if applications else None
    result["latest_feedback"] = next((row for row in (feedback or []) if str(row.get("service_record_id")) == latest_id), None)
    return result


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
            params={"select": "*", "id": f"eq.{user_id}", "limit": "1"},
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    if not isinstance(users, list) or not users:
        return jsonify({"success": False, "error": "Applicant was not found."}), 404

    profile = users[0]
    try:
        existing = _supabase("GET", "octogenarian_benefit_applications", params={
            "user_id": f"eq.{user_id}", "select": "*", "order": "created_at.desc",
        }) or []
        eligibility = load_birthday_eligibility(user_id, profile.get("dob"), existing)
        if not eligibility["can_apply"]:
            return jsonify({"error": eligibility["message"]}), 409
    except Exception:
        return jsonify({"error": "Could not check application eligibility. Please try again."}), 503
    applicant_dob = str(profile.get("dob") or "").strip()
    try:
        try:
            applicant_birth_date = datetime.strptime(applicant_dob, "%Y-%m-%d").date()
        except ValueError:
            applicant_birth_date = datetime.strptime(applicant_dob, "%m/%d/%Y").date()
        today = date.today()
        applicant_age = today.year - applicant_birth_date.year - (
            (today.month, today.day) < (applicant_birth_date.month, applicant_birth_date.day)
        )
    except ValueError:
        return jsonify({"success": False, "error": "A valid date of birth is required."}), 400

    if applicant_age < 60:
        return jsonify({
            "success": False,
            "error": "Only users aged 60 and above may avail senior citizen services.",
        }), 403

    # Eligibility uses the saved profile DOB, not a client-supplied age.
    date_of_birth = str(profile.get("dob") or "").strip()
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
    payload["osca_id_number"] = format_senior_id({**profile, "id": user_id})
    payload["benefit_type"] = benefit_type
    payload["benefit_milestone"] = birthday_benefit_milestone(date_of_birth)
    profile_birth_certificate = (
        profile.get("birth_certificate")
        or profile.get("birthcert")
        or profile.get("birthCertificate")
    )
    profile_id_picture = profile.get("avatar_url") or profile.get("profile_photo")
    # A registered users.id is the digital ID source for this application.
    has_digital_id = profile.get("id") is not None
    has_birth_certificate = bool(
        profile.get("birth_certificate")
        or profile.get("birthcert")
        or profile.get("birthCertificate")
    )
    has_id_picture = bool(profile_id_picture)
    payload["birth_certificate_submitted"] = has_birth_certificate
    payload["valid_id_submitted"] = has_digital_id
    payload["id_picture_submitted"] = has_id_picture
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
        missing_column = missing_schema_column(exc)
        if missing_column not in payload:
            return jsonify({"success": False, "error": str(exc)}), 500

        # Older Supabase deployments may not have refreshed the migration/schema
        # cache yet. Retry without only the column Supabase reported as missing.
        compatibility_payload = {
            key: value for key, value in payload.items() if key != missing_column
        }
        try:
            created = _supabase(
                "POST",
                "octogenarian_benefit_applications",
                payload=compatibility_payload,
            )
        except Exception as retry_exc:
            second_missing_column = missing_schema_column(retry_exc)
            if second_missing_column not in compatibility_payload:
                return jsonify({"success": False, "error": str(retry_exc)}), 500
            try:
                created = _supabase(
                    "POST",
                    "octogenarian_benefit_applications",
                    payload={
                        key: value
                        for key, value in compatibility_payload.items()
                        if key != second_missing_column
                    },
                )
            except Exception as final_exc:
                return jsonify({"success": False, "error": str(final_exc)}), 500

    application = created[0] if isinstance(created, list) and created else created
    if isinstance(application, dict) and "date_of_birth" not in application:
        application["date_of_birth"] = date_of_birth
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
            params={"select": "*", "limit": "10000"},
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    user_map = {str(user.get("id")): user for user in users if user.get("id") is not None}
    result = []
    for application in applications:
        user = user_map.get(str(application.get("user_id")), {})
        birth_cert_url = (
            user.get("birth_certificate")
            or user.get("birthcert")
            or user.get("birthCertificate")
            or None
        )
        valid_id_url = (
            user.get("valid_id")
            or user.get("valid_id_url")
            or user.get("validId")
            or user.get("validIdUrl")
            or None
        )
        id_picture_url = (
            user.get("id_picture")
            or user.get("id_picture_url")
            or user.get("idPicture")
            or user.get("idPictureUrl")
            or user.get("avatar_url")
            or user.get("profile_photo")
            or None
        )
        has_birth_certificate = bool(birth_cert_url)
        has_valid_id = bool(user.get("valid_id_submitted") or valid_id_url)
        has_id_picture = bool(id_picture_url)
        result.append({
            **application,
            "validated_by_name": (
                " ".join(
                    part for part in (
                        user_map.get(str(application.get("validated_by")), {}).get("first_name"),
                        user_map.get(str(application.get("validated_by")), {}).get("middle_name"),
                        user_map.get(str(application.get("validated_by")), {}).get("last_name"),
                    )
                    if part
                )
                or None
            ),
            "date_of_birth": application.get("date_of_birth") or user.get("dob"),
            "birth_certificate_submitted": bool(application.get("birth_certificate_submitted") or has_birth_certificate),
            "birth_certificate_url": birth_cert_url,
            "valid_id_submitted": bool(application.get("valid_id_submitted") or has_valid_id),
            "valid_id_url": valid_id_url,
            "id_picture_submitted": bool(application.get("id_picture_submitted") or has_id_picture),
            "id_picture_url": id_picture_url,
            "applicant": {
                "firstName": user.get("first_name") or "",
                "middleName": user.get("middle_name") or "",
                "lastName": user.get("last_name") or "",
                "email": user.get("email") or application.get("email_address") or "",
                "contact": user.get("contact") or application.get("contact_number") or "",
                "gender": user.get("gender") or "",
                "civilStatus": user.get("civil_status") or user.get("civilStatus") or "",
                "address": user.get("address") or "",
                "children": user.get("children") or [],
                "avatarUrl": id_picture_url,
                "oscaIdNumber": user.get("osca_id_number") or "",
                "digitalSignature": user.get("digital_signature") or user.get("signature") or None,
            },
        })

    return jsonify({"success": True, "applications": result}), 200


@benefit_applications_bp.route("/user/<int:user_id>", methods=["GET", "OPTIONS"])
def get_user_benefit_applications(user_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        applications = _supabase(
            "GET",
            "octogenarian_benefit_applications",
            params={
                "select": "*",
                "user_id": f"eq.{user_id}",
                "order": "created_at.desc",
            },
        )
        users = _supabase("GET", "users", params={"id": f"eq.{user_id}", "select": "id,dob", "limit": "1"}) or []
        if not users:
            return jsonify({"error": "Applicant not found."}), 404
        eligibility = load_birthday_eligibility(user_id, users[0].get("dob"), applications or [])
        return jsonify({"success": True, "applications": applications or [],
                        "feedback": eligibility.pop("latest_feedback", None), "eligibility": eligibility}), 200
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@benefit_applications_bp.route("/admin/<application_id>", methods=["PATCH", "OPTIONS"])
def update_admin_benefit_application(application_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    try:
        current_rows = _supabase(
            "GET",
            "octogenarian_benefit_applications",
            params={
                "select": "benefit_status,benefit_amount,date_released",
                "id": f"eq.{application_id}",
                "limit": "1",
            },
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
    current = current_rows[0] if isinstance(current_rows, list) and current_rows else {}
    allowed = {
        "validation_status",
        "benefit_status",
        "findings_concerns_recommendations",
        "benefit_amount",
        "validated_by",
        "date_validated",
        "date_released",
    }
    payload = {key: data[key] for key in allowed if key in data}
    if not payload:
        return jsonify({"success": False, "error": "No review fields to update."}), 400

    if "validation_status" in payload and payload["validation_status"] not in {"Pending", "Under Review", "Eligible", "Ineligible", "Approved", "Rejected"}:
        return jsonify({"success": False, "error": "Invalid validation status."}), 400
    if "benefit_status" in payload and payload["benefit_status"] not in {"Pending", "For Processing", "Approved", "Released", "Cancelled"}:
        return jsonify({"success": False, "error": "Invalid benefit status."}), 400
    if "benefit_amount" in payload:
        try:
            payload["benefit_amount"] = float(payload["benefit_amount"])
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Benefit amount must be a valid number."}), 400
        if payload["benefit_amount"] < 0:
            return jsonify({"success": False, "error": "Benefit amount cannot be negative."}), 400
    effective_status = payload.get("benefit_status", current.get("benefit_status"))
    effective_amount = payload.get("benefit_amount", current.get("benefit_amount"))
    if effective_status in {"Approved", "Released"} and (
        effective_amount is None or float(effective_amount) <= 0
    ):
        return jsonify({"success": False, "error": "Enter a benefit amount before approving this application."}), 400
    if effective_status == "Released":
        payload["date_released"] = (
            current.get("date_released") or date.today().isoformat()
        )
    elif "benefit_status" in payload:
        payload["date_released"] = None
    if "validation_status" in payload:
        if payload["validation_status"] == "Pending":
            payload["validated_by"] = None
            payload["date_validated"] = None
        else:
            try:
                payload["validated_by"] = int(payload["validated_by"])
            except (KeyError, TypeError, ValueError):
                return jsonify({"success": False, "error": "validated_by is required when validating an application."}), 400
            payload["date_validated"] = date.today().isoformat()

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


@benefit_applications_bp.route("/<application_id>/feedback", methods=["GET", "POST"])
def birthday_benefit_feedback(application_id):
    data = (request.get_json(silent=True) or {}) if request.method == "POST" else request.args
    try:
        user_id = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "user_id is required."}), 400
    try:
        applications = _supabase("GET", "octogenarian_benefit_applications", params={
            "id": f"eq.{application_id}", "user_id": f"eq.{user_id}", "select": "*", "limit": "1",
        }) or []
        if not applications:
            return jsonify({"error": "Application not found."}), 404
        params = {"user_id": f"eq.{user_id}", "service_key": "eq.birthday_benefits",
                  "service_record_id": f"eq.{application_id}", "select": "*", "limit": "1"}
        existing = _supabase("GET", "service_feedback", params=params) or []
        if request.method == "GET":
            return jsonify({"feedback": existing[0] if existing else None}), 200
        if applications[0].get("benefit_status") != "Released":
            return jsonify({"error": "Feedback is available after your benefit is released."}), 409
        if existing:
            return jsonify({"feedback": existing[0]}), 200
        rating = data.get("rating")
        comments = data.get("comments")
        if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
            return jsonify({"error": "Choose a rating from 1 to 5."}), 400
        if not isinstance(comments, str) or not 1 <= len(comments.strip()) <= 2000:
            return jsonify({"error": "Enter feedback between 1 and 2000 characters."}), 400
        rows = _supabase("POST", "service_feedback", payload={
            "user_id": user_id, "service_key": "birthday_benefits", "service_record_id": application_id,
            "rating": rating, "comments": comments.strip(),
        })
        return jsonify({"feedback": rows[0] if isinstance(rows, list) and rows else rows}), 201
    except Exception:
        return jsonify({"error": "Could not load or save feedback. Please try again."}), 503
