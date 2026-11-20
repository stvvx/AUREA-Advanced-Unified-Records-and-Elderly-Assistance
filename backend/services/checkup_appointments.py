from datetime import datetime, timedelta, timezone

TABLE = "checkup_appointments"
SUMMARY = "id,center_id,status,scheduled_at,review_note,created_at"
CENTERS = {
    "sanchez": ("Mayor Juan R. Sanchez Health Center", "Sta. Ana Zones 1–4"),
    "masikap": ("Masikap Health Center", "Sta. Ana Zones 5–6, San Roque"),
    "de-borja": ("Quintin de Borja Health Center", "Poblacion, Aguho, Martirez del 96"),
    "flores": ("Mayor Moises R. Flores Health Center", "Magtanggol, Tabacalera, San Pedro"),
    "salonga": ("Mayor Delfin C. Salonga Health Center", "Sto. Rosario Silangan at Kanluran"),
}
OPEN = {"Pending", "Confirmed"}
MANILA = timezone(timedelta(hours=8))


def centers():
    return [{"id": key, "name": name, "area": area} for key, (name, area) in CENTERS.items()]


def patient_details(data):
    fields = {
        "name": "pangalan",
        "sex": "kasarian",
        "address": "address",
        "contactNumber": "contact number",
        "emergencyContact": "emergency contact",
        "relationshipToEmergencyContact": "relasyon sa emergency contact",
        "reasonForConsultation": "dahilan ng check-up",
    }
    optional = ("existingMedicalCondition", "currentMedication", "allergies", "previousMedicalHistory")
    details = {}
    for key, label in fields.items():
        value = data.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 2000:
            raise ValueError(f"Pakilagay ang {label} (hanggang 2,000 characters).")
        details[key] = value.strip()
    for key in optional:
        value = data.get(key, "")
        if not isinstance(value, str) or len(value) > 2000:
            raise ValueError("Hanggang 2,000 characters bawat field sa medical details.")
        details[key] = value.strip()
    return details


def schedule(date, time):
    try:
        slot = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=MANILA)
    except ValueError:
        raise ValueError("Ilagay ang petsa (YYYY-MM-DD) at oras (HH:MM, 24-hour format).") from None
    if slot <= datetime.now(MANILA):
        raise ValueError("Pumili ng schedule sa darating na petsa at oras.")
    return slot.isoformat()
