"""Format senior IDs from the resident's barangay, preserving their number."""
import re
BARANGAY_PREFIXES = [['aguho', 'AG'], ['magtanggol', 'MG'], ['martires del 96', 'MD96'], ['martires del 1996', 'MD96'], ['martirez del 96', 'MD96'], ['poblacion', 'PB'], ['san pedro', 'SP'], ['san roque', 'SR'], ['santa ana', 'SA'], ['sta ana', 'SA'], ['st anne', 'SA'], ['santa anna', 'SA'], ['santo rosario kanluran', 'SRK'], ['sto rosario kanluran', 'SRK'], ['santo rosario silangan', 'SRS'], ['sto rosario silangan', 'SRS'], ['tabacalera', 'TB']]


def format_senior_id(profile):
    raw_address = str(profile.get("barangay") or profile.get("address") or "")
    barangay = re.search(r"(?:^|[\s,])(?:brgy\.?|barangay|bgy\.?)\s+([^,]+)", raw_address, re.I)
    address = re.sub(r"[^a-z0-9]+", " ", (barangay.group(1) if barangay else raw_address).lower()).strip()
    prefix = next((code for name, code in BARANGAY_PREFIXES if f" {name} " in f" {address} "), None)
    stored = str(profile.get("osca_id_number") or "").strip()
    match = re.fullmatch(r"[A-Z0-9]+-(\d+)", stored, re.I)
    number = match.group(1) if match else str(profile["id"]).zfill(4) if profile.get("id") else ""
    return f"{prefix}-{number}" if prefix and number else stored
