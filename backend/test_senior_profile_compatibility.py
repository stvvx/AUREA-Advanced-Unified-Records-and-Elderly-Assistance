"""Profile contract tests without loading face-recognition or server dependencies.
Database trigger checks live in migrations/checks/012_verify_seniors_compatibility.sql.
"""
import ast
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class SeniorProfileCompatibilityTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in {"_serialize_user", "user_profile", "normalize_address", "admin_users"}]
        for node in functions:
            node.decorator_list = []
        self.patch = Mock(return_value=SimpleNamespace(ok=True, json=lambda: [{"id": 7}]))
        self.request = SimpleNamespace(method="PUT", get_json=lambda **kwargs: {})
        self.context = {
            "request": self.request, "ensure_users_table": lambda: None,
            "with_senior_fields": lambda rows, rest: rows, "supabase_rest": Mock(return_value=[]),
            "jsonify": lambda value: value, "Decimal": Decimal, "InvalidOperation": InvalidOperation,
            "requests": SimpleNamespace(patch=self.patch), "_rest_headers": lambda **kwargs: {},
            "SENIOR_CATEGORIES": {"Physically Stable", "Bedridden", "PWD", "Has Illness", "Not Specified"},
            "SUPABASE_URL": "https://example.invalid", "SUPABASE_USERS_TABLE": "users",
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), "app-profile-contract", "exec"), self.context)

    def test_admin_users_returns_all_pages_and_profile_details_without_credentials(self):
        self.request.method = "GET"
        first_page = [{"id": index, "monthly_income": 5000, "category": "PWD",
                       "password_hash": "secret"} for index in range(100)]
        self.context["supabase_rest"].side_effect = [first_page, [{"id": 100}]]
        body, status = self.context["admin_users"]()
        self.assertEqual(status, 200)
        self.assertEqual(len(body["users"]), 101)
        self.assertEqual(body["users"][0]["monthlyIncome"], 5000)
        self.assertEqual(body["users"][0]["category"], "PWD")
        self.assertNotIn("password_hash", body["users"][0])
        calls = self.context["supabase_rest"].call_args_list
        self.assertEqual(calls[0].kwargs["params"]["select"], "*")
        self.assertEqual(calls[1].kwargs["params"]["offset"], "100")

    def test_profile_preserves_legacy_fields_and_excludes_credentials(self):
        profile = self.context["_serialize_user"]({
            "id": 7, "first_name": "Ana", "dob": "1944-10-16", "role": "user",
            "contact": "09123456789", "birth_certificate": "certificate.pdf",
            "digital_signature": "signature.png", "children": [{"name": "Child"}],
            "osca_id_number": "SA-0007", "spouse": "Juan", "monthly_income": "5000.00",
            "category": "Octogenarian", "password_hash": "secret", "token": "secret", "ip_address": "secret",
        })
        self.assertEqual(profile["id"], 7)
        self.assertEqual(profile["birthcert"], "certificate.pdf")
        self.assertEqual(profile["digitalSignature"], "signature.png")
        self.assertEqual(profile["oscaIdNumber"], "SA-0007")
        self.assertEqual(profile["spouse"], "Juan")
        self.assertEqual(profile["monthlyIncome"], "5000.00")
        for key in ("password_hash", "token", "ip_address"):
            self.assertNotIn(key, profile)

    def update(self, payload):
        self.request.get_json = lambda **kwargs: payload
        return self.context["user_profile"](7)

    def test_existing_profile_update_contract(self):
        self.assertEqual(self.update({"firstName": "Ana", "birthcert": "certificate.pdf"})[1], 200)
        self.assertEqual(self.patch.call_args.kwargs["json"], {
            "first_name": "Ana", "birth_certificate": "certificate.pdf"})

    def test_spouse_and_income_update(self):
        self.assertEqual(self.update({"spouse": " Juan ", "monthlyIncome": "1500.5"})[1], 200)
        self.assertEqual(self.patch.call_args.kwargs["json"], {"spouse": "Juan", "monthly_income": "1500.50"})

    def test_invalid_income_never_reaches_database(self):
        for value in (-1, "NaN", "Infinity", "invalid", True, "10000000000"):
            with self.subTest(value=value):
                self.patch.reset_mock()
                self.assertEqual(self.update({"monthlyIncome": value})[1], 400)
                self.patch.assert_not_called()

    def test_health_category_updates(self):
        for category in ("Physically Stable", "Bedridden", "PWD", "Has Illness", "Not Specified"):
            self.assertEqual(self.update({"category": category})[1], 200)
            self.assertEqual(self.patch.call_args.kwargs["json"]["category"], category)

    def test_age_category_is_rejected(self):
        for category in ("Octogenarian", "Centenarian", "", None):
            self.patch.reset_mock()
            self.assertEqual(self.update({"category": category})[1], 400)
            self.patch.assert_not_called()

    def test_income_can_be_cleared(self):
        self.assertEqual(self.update({"monthlyIncome": None})[1], 200)
        self.assertIsNone(self.patch.call_args.kwargs["json"]["monthly_income"])


if __name__ == "__main__":
    unittest.main()
