from services.physical_ids import senior_profile_requirements

TABLE = "social_pension_applications"
TRANSITIONS = {"Pending": {"Endorsed", "Returned"}, "Endorsed": {"Approved", "Returned"}}


def requirement_check(profile):
    missing, eligibility = senior_profile_requirements(
        profile, "Kailangang taga-Pateros at edad 60 pataas para mag-apply sa Social Pension.",
    )
    labels = {
        "pension_intake": "Completed and signed DSWD Social Pension intake form",
        "senior_id": "Senior Citizen ID copy with 3 specimen signatures or a right thumbmark",
        "indigency_certificate": "Barangay Certificate of Indigency",
        "portrait": "Recent 1×1 ID photo",
    }
    reused = {
        key: value.strip()
        for key, value in {"senior_id": profile.get("oscaIdNumber"), "portrait": profile.get("avatarUrl")}.items()
        if isinstance(value, str) and value.strip()
    }
    return {
        "missingProfile": missing,
        "needsSignature": False,
        "eligibilityMessage": eligibility,
        "documents": [
            {"key": key, "label": "Senior Citizen ID" if key == "senior_id" and key in reused else label,
             "onFile": key in reused}
            for key, label in labels.items()
        ],
    }, reused
