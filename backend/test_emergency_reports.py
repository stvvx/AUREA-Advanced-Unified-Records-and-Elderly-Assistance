import unittest
from unittest.mock import patch

import app as backend


class EmergencyReportTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        self.profile = {"id": 7, "role": "user", "firstName": "Ana", "lastName": "Reyes"}
        self.payload = {
            "requestKey": "report-abc-123",
            "category": "accident",
            "location": "Aguho, Pateros",
            "contact": "09123456789",
            "description": "One person affected.",
        }
        session = patch.object(backend, "current_session", side_effect=self.session)
        self.addCleanup(session.stop)
        session.start()

    def session(self):
        return backend.jsonify({"user": self.profile}), 200

    @patch.object(backend, "supabase_rest")
    def test_report_uses_signed_in_owner_and_returns_tracking(self, rest):
        rest.return_value = [{"id": "reference", "status": "Submitted"}]
        response = self.client.post("/api/emergency-reports", json={**self.payload, "user_id": 999})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["report"]["id"], "reference")
        self.assertEqual(rest.call_args.kwargs["payload"]["user_id"], 7)
        response = self.client.get("/api/emergency-reports?user_id=999")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rest.call_args.kwargs["params"]["user_id"], "eq.7")

    @patch.object(backend, "supabase_rest")
    def test_retry_returns_the_same_reference(self, rest):
        rest.side_effect = [RuntimeError("conflict"), [{"id": "original-report"}]]
        response = self.client.post("/api/emergency-reports", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["report"]["id"], "original-report")
        self.assertEqual(rest.call_args.kwargs["params"]["request_key"], "eq.report-abc-123")

    @patch.object(backend, "supabase_rest")
    def test_requires_exact_location_and_restricts_staff_updates(self, rest):
        self.assertEqual(self.client.post("/api/emergency-reports", json={**self.payload, "location": ""}).status_code, 400)
        path = "/api/emergency-reports/staff/987aa56d-fa9d-4dca-9984-90adcf96620c"
        self.assertEqual(self.client.get(path).status_code, 403)
        rest.assert_not_called()
        self.profile["role"] = "osca admin"
        rest.side_effect = [[{"status": "Submitted"}], [], [{"status": "Acknowledged", "review_note": None}]]
        response = self.client.patch(path, json={"status": "Acknowledged"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rest.call_args_list[1].kwargs["params"]["status"], "eq.Submitted")
