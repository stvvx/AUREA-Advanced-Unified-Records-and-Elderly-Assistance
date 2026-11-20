import base64
import binascii
from datetime import date, datetime, timedelta, timezone

TABLE = "physical_id_applications"
SUMMARY = "id,user_id,request_type,status,review_note,created_at"
REQUEST_TYPES = {"new", "lost", "worn"}
PROFILE_FIELDS = {
    "firstName": "Unang pangalan",
    "lastName": "Apelyido",
    "dob": "Petsa ng kapanganakan",
    "address": "Address",
    "contact": "Contact number",
}
DOCUMENTS = {
    "government_id": "Philippine government-issued ID",
    "residency": "Barangay certification of residency",
    "affidavit": "Affidavit of Loss",
    "authorization": "Signed authorization for your immediate relative",
    "representative_id": "Immediate relative’s Philippine government-issued ID",
    "portrait": "Recent ID photo",
    "birth_certificate": "PSA birth certificate",
}
TRANSITIONS = {"Pending": {"Ready for pickup", "Returned"}, "Ready for pickup": {"Released", "Returned"}}


def senior_profile_requirements(profile, ineligible_message):
    missing = [label for key, label in PROFILE_FIELDS.items() if not str(profile.get(key) or "").strip()]
    eligibility = None
    if profile.get("dob"):
        today = datetime.now(timezone(timedelta(hours=8))).date()
        try:
            try:
                birth = date.fromisoformat(profile["dob"])
            except ValueError:
                birth = datetime.strptime(profile["dob"], "%m/%d/%Y").date()
            age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
            if age < 60:
                eligibility = ineligible_message
        except (TypeError, ValueError):
            if PROFILE_FIELDS["dob"] not in missing:
                missing.append(PROFILE_FIELDS["dob"])

    return missing, eligibility


def requirement_check(profile, request_type, represented):
    missing, eligibility = senior_profile_requirements(
        profile, "Para sa mga taga-Pateros na edad 60 pataas ang Physical Senior Citizen ID.",
    )
    required = ["government_id"]
    reused = {}
    if request_type == "new":
        required += ["birth_certificate", "residency"]
        reused["birth_certificate"] = profile.get("birthcert")
    if request_type == "lost":
        required.append("affidavit")
    if represented:
        required += ["authorization", "representative_id"]
    required.append("portrait")
    reused["portrait"] = profile.get("avatarUrl")
    reused = {key: value for key, value in reused.items() if isinstance(value, str) and value.strip()}
    return {
        "missingProfile": missing,
        "needsSignature": not bool(str(profile.get("signature") or "").strip()),
        "eligibilityMessage": eligibility,
        "documents": [{"key": key, "label": DOCUMENTS[key], "onFile": key in reused} for key in required],
    }, reused


def applicant_snapshot(profile, representative):
    return {
        **{key: profile.get(key) for key in (*PROFILE_FIELDS, "middleName", "oscaIdNumber", "signature")},
        "representative": representative,
    }


def application_attachments(requirements, reused, retained, submitted):
    if not isinstance(submitted, dict):
        raise ValueError("Mag-attach ng mga litrato ng kailangang dokumento.")
    attachments = {key: {"onFile": value} for key, value in reused.items()}
    for document in requirements["documents"]:
        key, label = document["key"], document["label"]
        if key in attachments:
            continue
        encoded = submitted.get(key)
        if not encoded and key in retained:
            attachments[key] = retained[key]
            continue
        if not isinstance(encoded, str) or not encoded or len(encoded) > 1_400_000:
            raise ValueError(f"Mag-attach ng photo ng {label} na mas mababa sa 1 MB.")
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise ValueError(f"Mag-attach ng valid na JPEG photo ng {label}.") from None
        if not decoded.startswith(b"\xff\xd8\xff") or not decoded.endswith(b"\xff\xd9") or len(decoded) > 1_048_576:
            raise ValueError(f"Mag-attach ng JPEG photo ng {label} na mas mababa sa 1 MB.")
        attachments[key] = {"jpeg": encoded}
    return attachments
