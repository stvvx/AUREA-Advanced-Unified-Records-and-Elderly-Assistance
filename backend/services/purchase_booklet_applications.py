from services.physical_ids import DOCUMENTS, TRANSITIONS, senior_profile_requirements

TABLE = "purchase_booklet_applications"


def requirement_check(profile, represented):
    missing, eligibility = senior_profile_requirements(
        profile, "Para sa mga taga-Pateros na edad 60 pataas ang Purchase Booklet.",
    )
    senior_id = str(profile.get("oscaIdNumber") or "").strip()
    labels = {"senior_id": "Senior Citizen ID"}
    if represented:
        labels.update({key: DOCUMENTS[key] for key in ("authorization", "representative_id")})
    reused = {"senior_id": senior_id} if senior_id else {}
    return {
        "missingProfile": missing,
        "needsSignature": False,
        "eligibilityMessage": eligibility,
        "documents": [{"key": key, "label": label, "onFile": key in reused} for key, label in labels.items()],
    }, reused
