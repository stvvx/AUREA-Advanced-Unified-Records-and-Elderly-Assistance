import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests
from services import psa_population as psa


def page(population=30, census="2024 POPCEN"):
    return f'''<table><tr><th>Income Class</th><th>Population ({census})</th></tr>
      <tr><td>1st</td><td>{population}</td></tr></table>
      <table><tr><th>Barangays</th><th>10 Digit Code</th><th>Correspondence Code</th>
      <th>Urban/Rural</th><th>Population ({census})</th></tr>
      <tr><td><a>Aguho</a></td><td>1381701001</td><td>137606001</td><td>Urban</td><td>10</td></tr>
      <tr><td>Santa Ana</td><td>1381701007</td><td>137606007</td><td>Urban</td><td>20</td></tr></table>'''


class PsaPopulationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = patch.object(psa, "CACHE", Path(self.temp.name) / "cache.json")
        self.cache.start()
        self.addCleanup(self.cache.stop)
        psa._data = None
        psa._next_check = 0

    def test_snapshot_barangays_sum_to_total(self):
        data = json.loads(psa.SNAPSHOT.read_text())
        self.assertEqual(len(data["barangays"]), 10)
        self.assertEqual(sum(row["value"] for row in data["barangays"]), data["population"])

    def test_parses_census_and_sorts_counts(self):
        data = psa.parse_population(page(census="2028 POPCEN"))
        self.assertEqual(data["census"], "2028 POPCEN")
        self.assertEqual(data["population"], 30)
        self.assertEqual(data["barangays"][0]["name"], "Santa Ana")

    def test_rejects_incomplete_or_inconsistent_source(self):
        for html in ("<html>Access denied</html>", page(population=40),
                     page().replace("1381701007", "1381701001")):
            with self.subTest(html=html), self.assertRaises(ValueError):
                psa.parse_population(html)

    @patch.object(psa.requests, "get", side_effect=requests.HTTPError("403 Forbidden"))
    def test_blocked_source_keeps_verified_snapshot_and_limits_retries(self, get):
        first = psa.get_population()
        second = psa.get_population()
        self.assertEqual(first["population"], 67319)
        self.assertEqual(first["sync_status"], "saved")
        self.assertEqual(first["verified_at"], "2026-11-15")
        self.assertEqual(first, second)
        get.assert_called_once()

    @patch.object(psa.requests, "get")
    def test_new_release_updates_year_counts_and_persists(self, get):
        get.return_value = Mock(text=page(census="2028 POPCEN"))
        result = psa.get_population()
        self.assertEqual(result["census"], "2028 POPCEN")
        self.assertEqual(result["sync_status"], "verified")
        self.assertNotIn("reference_date", result)
        psa._data = None
        get.side_effect = requests.ConnectionError("Offline")
        psa._next_check = 0
        self.assertEqual(psa.get_population()["population"], 30)


if __name__ == "__main__":
    unittest.main()
