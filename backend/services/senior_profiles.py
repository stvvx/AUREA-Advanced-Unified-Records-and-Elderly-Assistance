from services.senior_ids import format_senior_id

"""Keep the existing user API shape while senior-only fields live in seniors."""
def with_senior_fields(rows, rest):
    if not isinstance(rows, list) or not rows:
        return rows
    ids = [str(row["id"]) for row in rows if row.get("id") is not None]
    if not ids:
        return rows
    profiles = []
    for offset in range(0, len(ids), 100):
        profiles.extend(rest("GET", "seniors", params={
            "user_id": "in.(" + ",".join(ids[offset:offset + 100]) + ")",
            "select": "user_id,signature,osca_id_number,source_of_income,occupation,spouse",
        }) or [])
    by_user = {str(profile["user_id"]): profile for profile in profiles}
    result = []
    for row in rows:
        profile = by_user.get(str(row.get("id")))
        if profile is not None:
            row = {**row, "digital_signature": profile.get("signature"),
                   "signature": profile.get("signature"), "osca_id_number": profile.get("osca_id_number"),
                   "source_of_income": profile.get("source_of_income"), "occupation": profile.get("occupation"),
                   "spouse": profile.get("spouse")}
        if profile is not None:
            row["osca_id_number"] = format_senior_id(row)
        result.append(row)
    return result


def income_source_patch(data, current):
    source = data.get("sourceOfIncome", current.get("source_of_income"))
    if source == "":
        source = None
    if source not in (None, "Pension", "Allowance", "Working"):
        raise ValueError("Select Pension, Allowance or Working as your source of income.")
    occupation = data.get("occupation", current.get("occupation"))
    if source == "Working":
        if not isinstance(occupation, str) or not 1 <= len(occupation.strip()) <= 200:
            raise ValueError("Please specify your work using 1 to 200 characters.")
        occupation = occupation.strip()
    else:
        occupation = None
    return {"source_of_income": source, "occupation": occupation}
