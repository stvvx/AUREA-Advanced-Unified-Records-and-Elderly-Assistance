TABLE = "emergency_reports"
SUMMARY = "id,status,review_note,created_at,category:details->>category"
CATEGORIES = {
    "medical": "Medical emergency",
    "fire": "Sunog",
    "accident": "Aksidente",
    "safety": "Banta sa kaligtasan",
    "other": "Iba pa",
}
TRANSITIONS = {"Submitted": "Acknowledged", "Acknowledged": "Closed"}


def report_details(data):
    category = data.get("category")
    if not isinstance(category, str) or category not in CATEGORIES:
        raise ValueError("Piliin ang uri ng emergency.")
    fields = {
        "location": ("eksaktong lokasyon ng emergency", 400),
        "contact": ("contact number", 60),
        "description": ("detalye ng nangyari", 1500),
    }
    details = {"category": category}
    for key, (label, limit) in fields.items():
        value = data.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f"Ilagay ang {label} (hanggang {limit} characters).")
        details[key] = value.strip()
    return details
