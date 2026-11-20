from services.physical_ids import DOCUMENTS, TRANSITIONS, senior_profile_requirements

TABLE = "osca_transfer_applications"


def requirement_check(profile, represented):
    missing, eligibility = senior_profile_requirements(
        profile, "Para sa senior citizens na edad 60 pataas ang transfer request na ito.",
    )
    senior_id = str(profile.get("oscaIdNumber") or "").strip()
    reused = {"senior_id": senior_id} if senior_id else {}
    labels = {
        "senior_id": "Senior Citizen ID",
        "transfer_residency": "Barangay Certificate mula sa bagong barangay",
    }
    if represented:
        labels.update({key: DOCUMENTS[key] for key in ("authorization", "representative_id")})
    return {
        "missingProfile": missing,
        "needsSignature": False,
        "eligibilityMessage": eligibility,
        "documents": [{"key": key, "label": label, "onFile": key in reused} for key, label in labels.items()],
    }, reused
