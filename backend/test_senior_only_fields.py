"""Tests for the senior-only signature and OSCA ID storage contract."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock
from services.senior_profiles import with_senior_fields, income_source_patch


class SeniorOnlyFieldTests(unittest.TestCase):
    def test_reads_merge_by_account_id_not_senior_id(self):
        rest = Mock(return_value=[{"id": 999, "user_id": 7, "signature": "signed", "osca_id_number": "SA-0007"}])
        original = [{"id": 7, "first_name": "Ana"}, {"id": 8, "role": "osca admin"}]
        merged = with_senior_fields(original, rest)
        self.assertEqual(merged[0]["id"], 7)
        self.assertEqual(merged[0]["digital_signature"], "signed")
        self.assertEqual(merged[0]["osca_id_number"], "SA-0007")
        self.assertNotIn("digital_signature", original[0])
        self.assertEqual(merged[1], original[1])
        self.assertEqual(rest.call_args.args, ("GET", "seniors"))

    def test_spouse_comes_from_linked_senior(self):
        rest = Mock(return_value=[{"user_id": 7, "spouse": "Juan Dela Cruz"}])
        result = with_senior_fields([{"id": 7, "spouse": "Old account value"}], rest)
        self.assertEqual(result[0]["spouse"], "Juan Dela Cruz")
        self.assertIn("spouse", rest.call_args.kwargs["params"]["select"])
        rest.return_value = [{"user_id": 7, "spouse": None}]
        self.assertIsNone(with_senior_fields([{"id": 7, "spouse": "Stale value"}], rest)[0]["spouse"])

    def test_signature_endpoint_updates_seniors_only(self):
        tree = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "save_digital_signature")
        node.decorator_list = []
        rest = Mock(side_effect=[[{"user_id": 7}], [], [{"id": 7, "digital_signature": "signed"}]])
        context = {"request": SimpleNamespace(method="POST", get_json=lambda **kw: {"signature": "signed"}),
                   "ensure_users_table": lambda: None, "supabase_rest": rest, "SUPABASE_USERS_TABLE": "users",
                   "jsonify": lambda x: x, "_serialize_user": lambda x: x}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "signature-contract", "exec"), context)
        result, status = context["save_digital_signature"](7)
        self.assertEqual(status, 200)
        writes = [call for call in rest.call_args_list if call.args[0] == "PATCH"]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0].args[1], "seniors")
        self.assertEqual(writes[0].kwargs["params"], {"user_id": "eq.7"})
        self.assertEqual(writes[0].kwargs["payload"], {"signature": "signed"})
        self.assertEqual(result["user"]["id"], 7)

    def test_income_source_requires_work_details(self):
        for occupation in (None, "", "  ", "x" * 201):
            with self.assertRaises(ValueError):
                income_source_patch({"sourceOfIncome": "Working", "occupation": occupation}, {})
        self.assertEqual(income_source_patch({"sourceOfIncome": "Working", "occupation": " Vendor "}, {}),
                         {"source_of_income": "Working", "occupation": "Vendor"})

    def test_nonworking_sources_clear_old_work_details(self):
        for source in ("Pension", "Allowance", None):
            result = income_source_patch({"sourceOfIncome": source}, {"occupation": "Vendor"})
            self.assertEqual(result, {"source_of_income": source, "occupation": None})
        with self.assertRaises(ValueError):
            income_source_patch({"sourceOfIncome": "Unknown"}, {})

    def test_migration_preserves_values_and_stops_profile_overwrite(self):
        sql = Path(__file__).with_name("migrations").joinpath("015_senior_only_signature_and_osca_id.sql").read_text()
        self.assertLess(sql.index("UPDATE public.seniors"), sql.index("DROP COLUMN IF EXISTS digital_signature"))
        self.assertIn("DROP COLUMN IF EXISTS osca_id_number", sql)
        self.assertNotIn("signature = EXCLUDED.signature", sql)
        self.assertNotIn("osca_id_number = EXCLUDED.osca_id_number", sql)
        self.assertIn("'signature','osca_id_number'", sql)


if __name__ == "__main__":
    unittest.main()
