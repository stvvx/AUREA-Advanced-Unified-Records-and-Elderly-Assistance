"""Session lifecycle tests without importing optional biometric dependencies."""
import ast
import ipaddress
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


class UserSessionTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
        names = {"client_ip_address", "issue_user_session", "bearer_session_token", "current_session", "logout_session"}
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        for node in functions:
            node.decorator_list = []
        self.db = Mock(return_value=[])
        self.request = SimpleNamespace(remote_addr="192.168.1.20", headers={})
        self.context = {"request": self.request, "os": os, "ipaddress": ipaddress, "secrets": secrets,
                        "datetime": datetime, "timedelta": timedelta, "timezone": timezone,
                        "supabase_rest": self.db, "SUPABASE_USERS_TABLE": "users",
                        "_serialize_user": lambda u: {"id": u["id"]}, "jsonify": lambda x: x}
        exec(compile(ast.Module(body=functions, type_ignores=[]), "session-contract", "exec"), self.context)

    def test_token_rotation_and_ip(self):
        first = self.context["issue_user_session"]({"id": 1})
        second = self.context["issue_user_session"]({"id": 1})
        self.assertNotEqual(first["token"], second["token"])
        self.assertGreaterEqual(len(first["token"]), 48)
        payload = self.db.call_args.kwargs["payload"]
        self.assertEqual(payload["ip_address"], "192.168.1.20")
        self.assertGreater(datetime.fromisoformat(payload["token_expires_at"]), datetime.now(timezone.utc))

    def test_forwarded_ip_requires_explicit_trust(self):
        self.request.headers = {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"}
        with patch.dict(os.environ, {"TRUST_PROXY_HEADERS": "false"}):
            self.assertEqual(self.context["client_ip_address"](), "192.168.1.20")
        with patch.dict(os.environ, {"TRUST_PROXY_HEADERS": "true"}):
            self.assertEqual(self.context["client_ip_address"](), "203.0.113.10")

    def test_logout_clears_only_presented_token(self):
        token = "x" * 64
        self.request.headers = {"Authorization": "Bearer " + token}
        self.assertEqual(self.context["logout_session"]()[1], 200)
        self.assertEqual(self.db.call_args.kwargs["params"], {"token": "eq." + token})
        self.assertIsNone(self.db.call_args.kwargs["payload"]["token"])

    def test_invalid_and_expired_sessions(self):
        self.assertEqual(self.context["current_session"]()[1], 401)
        self.db.assert_not_called()
        self.request.headers = {"Authorization": "Bearer " + "x" * 64}
        for expiry in (None, "invalid", (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()):
            self.db.return_value = [{"id": 1, "token_expires_at": expiry}]
            self.assertEqual(self.context["current_session"]()[1], 401)

    def test_valid_session_response_does_not_leak_token(self):
        self.request.headers = {"Authorization": "Bearer " + "x" * 64}
        self.db.return_value = [{"id": 1, "token": "secret", "token_expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}]
        result, code = self.context["current_session"]()
        self.assertEqual(code, 200)
        self.assertNotIn("token", result["user"])


if __name__ == "__main__":
    unittest.main()
