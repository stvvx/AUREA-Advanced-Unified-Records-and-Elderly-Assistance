from services.physical_ids import DOCUMENTS, senior_profile_requirements

TABLE = "philhealth_applications"
TRANSITIONS = {"Pending": {"Endorsed", "Returned"}}


def requirement_check(profile, represented):
    missing, eligibility = senior_profile_requirements(
        profile, "Para sa mga taga-Pateros na edad 60 pataas ang tulong na ito sa PhilHealth enrollment.",
    )
    senior_id = str(profile.get("oscaIdNumber") or "").strip()
    labels = {
        "pmrf": "Completed and signed PhilHealth Member Registration Form (PMRF)",
        "senior_id": "Senior Citizen ID",
        "government_id": DOCUMENTS["government_id"],
    }
    if represented:
        labels.update({key: DOCUMENTS[key] for key in ("authorization", "representative_id")})
    return {
        "missingProfile": missing,
        "needsSignature": False,
        "eligibilityMessage": eligibility,
        "documents": [
            {"key": key, "label": label, "onFile": key == "senior_id" and bool(senior_id)}
            for key, label in labels.items()
        ],
    }, {"senior_id": senior_id} if senior_id else {}
