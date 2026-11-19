"""Read public PSA counts, validating a complete release before replacing saved data."""
import copy
import json
import re
import threading
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import requests

SOURCE_URL = "https://psa.gov.ph/classification/psgc/barangays/1381701000"
BASE = Path(__file__).resolve().parents[1]
SNAPSHOT = BASE / "data" / "pateros_population.json"
CACHE = BASE / ".cache" / "psa_population.json"
_lock = threading.Lock()
_next_check = 0
_data = None


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def parse_population(html):
    parser = Tables()
    parser.feed(html)
    municipal = barangays = None
    for table in parser.tables:
        for index, row in enumerate(table):
            if row and row[0] == "Income Class" and len(row) == 2:
                municipal = (row, table[index + 1])
            if row and row[0] == "Barangays" and len(row) == 5:
                barangays = (row, table[index + 1:])
    if municipal is None or barangays is None:
        raise ValueError("PSA population tables are unavailable")
    census = re.search(r"Population\s*\((\d{4}\s+(?:POPCEN|CPH))\)", municipal[0][1])
    if not census or municipal[0][1] != barangays[0][-1]:
        raise ValueError("PSA census headings are missing or inconsistent")
    rows = []
    for row in barangays[1]:
        if len(row) != 5 or not re.fullmatch(r"1381701\d{3}", row[1]):
            raise ValueError("Unexpected barangay row")
        rows.append(dict(name=row[0], code=row[1], classification=row[3], value=int(row[4].replace(",", ""))))
    population = int(municipal[1][1].replace(",", ""))
    if (not rows or len({row["code"] for row in rows}) != len(rows)
            or any(row["value"] < 0 for row in rows)
            or population <= 0 or sum(row["value"] for row in rows) != population):
        raise ValueError("PSA barangay counts do not match the municipal population")
    return dict(census=census[1], population=population, income_class=municipal[1][0],
                barangays=sorted(rows, key=lambda row: (-row["value"], row["name"])),
                source_url=SOURCE_URL, verified_at=datetime.now(timezone.utc).isoformat())


def get_population():
    global _data, _next_check
    with _lock:
        if _data is None:
            _data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
            try:
                saved = json.loads(CACHE.read_text(encoding="utf-8"))
                if int(saved["census"][:4]) >= int(_data["census"][:4]):
                    _data = saved
            except (OSError, ValueError, KeyError, TypeError):
                pass
        if time.monotonic() >= _next_check:
            try:
                response = requests.get(SOURCE_URL, timeout=(3, 7))
                response.raise_for_status()
                updated = parse_population(response.text)
                if int(updated["census"][:4]) < int(_data["census"][:4]):
                    raise ValueError("PSA returned an older census")
                # Carry the reference date only when the census is unchanged.
                if updated["census"] == _data["census"] and "reference_date" in _data:
                    updated["reference_date"] = _data["reference_date"]
                _data = updated
                _data["sync_status"] = "verified"
                _next_check = time.monotonic() + 86400
                try:
                    CACHE.parent.mkdir(exist_ok=True)
                    temp = CACHE.with_suffix(".tmp")
                    temp.write_text(json.dumps(_data), encoding="utf-8")
                    temp.replace(CACHE)
                except OSError:
                    pass  # Read-only hosting can still use the in-memory result.
            except (requests.RequestException, ValueError, IndexError, TypeError):
                _data["sync_status"] = "saved"
                _next_check = time.monotonic() + 3600
        return copy.deepcopy(_data)
