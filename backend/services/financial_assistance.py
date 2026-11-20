from services.physical_ids import PROFILE_FIELDS, senior_profile_requirements

TABLE = "financial_assistance_applications"
REQUEST_TYPES = {"medical", "burial"}
TRANSITIONS = {
    "Pending": {"Endorsed", "Returned"},
    "Endorsed": {"Ready for pickup", "Returned"},
    "Ready for pickup": {"Released", "Returned"},
}


def requirement_check(profile, request_type):
    if request_type == "medical":
        missing, eligibility = senior_profile_requirements(
            profile, "Para sa edad 60 pataas ang medical assistance sa form na ito.",
        )
    else:
        missing = [
            label for key, label in PROFILE_FIELDS.items()
            if key != "dob" and not str(profile.get(key) or "").strip()
        ]
        eligibility = None
    labels = {
        "indigency_clearance": "Barangay Indigency Clearance ng claimant",
        "senior_id": "Valid ID ng claimant",
    }
    if request_type == "medical":
        labels.update({
            "voter_proof": "Voter’s ID o Voter’s Certificate ng claimant at patient na nagpapakita ng Pateros residency",
            "medical_document": "Recent prescription o medical/clinical abstract",
        })
    else:
        labels.update({
            "death_certificate": "Death Certificate na nakarehistro sa Local Civil Registry",
            "deceased_id": "Valid ID ng yumao",
        })
    claimant_id = str(profile.get("oscaIdNumber") or "").strip()
    reused = {"senior_id": claimant_id} if claimant_id else {}
    return {
        "missingProfile": missing,
        "needsSignature": False,
        "eligibilityMessage": eligibility,
        "documents": [{"key": key, "label": label, "onFile": key in reused} for key, label in labels.items()],
    }, reused
