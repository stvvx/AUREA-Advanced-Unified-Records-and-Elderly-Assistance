import unittest
from unittest.mock import patch

import app as backend


class CheckupAppointmentTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        self.profile = {"id": 7, "role": "user", "dob": "1950-01-01"}
        self.request = {
            "centerId": "de-borja", "name": "Ana Reyes", "sex": "Female",
            "address": "Aguho, Pateros", "contactNumber": "09123456789",
            "emergencyContact": "09123456780", "relationshipToEmergencyContact": "Anak",
            "reasonForConsultation": "Follow-up check-up",
        }
        session = patch.object(backend, "current_session", side_effect=self.session)
        self.addCleanup(session.stop)
        session.start()

    def session(self):
        return backend.jsonify({"user": self.profile}), 200

    @patch.object(backend, "supabase_rest")
    def test_submission_uses_signed_in_account_and_excludes_medical_details_from_receipt(self, rest):
        rest.side_effect = [[], [{"id": "appointment", "status": "Pending"}]]
        response = self.client.post("/api/checkup-appointments", json={**self.request, "user_id": 999})
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("details", response.json["appointment"])
        self.assertEqual(rest.call_args_list[0].kwargs["params"]["user_id"], "eq.7")
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["user_id"], 7)
        self.assertEqual(payload["details"]["dateOfBirth"], "1950-01-01")

    @patch.object(backend, "supabase_rest", return_value=[{"status": "Confirmed"}])
    def test_duplicate_open_request_is_blocked(self, rest):
        self.assertEqual(self.client.post("/api/checkup-appointments", json=self.request).status_code, 409)
        rest.assert_called_once()

    @patch.object(backend, "supabase_rest")
    def test_only_medical_admin_can_confirm_with_a_valid_manila_schedule(self, rest):
        path = "/api/checkup-appointments/staff/987aa56d-fa9d-4dca-9984-90adcf96620c"
        decision = {"status": "Confirmed", "date": "2099-02-02", "time": "09:30"}
        self.assertEqual(self.client.patch(path, json=decision).status_code, 403)
        rest.assert_not_called()
        self.profile["role"] = "med admin"
        rest.side_effect = [
            [{"status": "Pending"}], [{"status": "Pending"}], [],
            [{"status": "Confirmed", "scheduled_at": "2099-02-02T01:30:00+00:00"}],
        ]
        self.assertEqual(self.client.patch(path, json={**decision, "time": "29:30"}).status_code, 400)
        self.assertEqual(self.client.patch(path, json=decision).status_code, 200)
        self.assertEqual(rest.call_args_list[2].kwargs["payload"]["scheduled_at"], "2099-02-02T09:30:00+08:00")
