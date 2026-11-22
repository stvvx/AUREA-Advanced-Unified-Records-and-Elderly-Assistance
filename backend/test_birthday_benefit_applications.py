import unittest
from unittest.mock import Mock, patch

import app as backend
from routes import benefit_applications
from services import memory_service
from services import email_notifications


class BirthdayBenefitApplicationTests(unittest.TestCase):
    def test_release_email_identifies_status_change_and_amount(self):
        previous = {"benefit_status": "Approved", "benefit_amount": 10000, "date_released": None}
        saved = {**previous, "id": "reference", "user_id": 7, "benefit_status": "Released",
                 "date_released": "2026-11-22"}
        with patch.dict("os.environ", {"SMTP_HOST": "smtp.example.test"}), patch.object(
            email_notifications, "notify_user"
        ) as send:
            email_notifications.notify_activity("PATCH", "birthday_benefit_applications", [saved],
                                                changes=saved, previous=previous)
        recipient, subject, body = send.call_args.args
        self.assertEqual(recipient, 7)
        self.assertIn("Na-release na", subject)
        self.assertIn("Benefit status: Approved na → Na-release na", body)
        self.assertIn("Halaga ng benefit: ₱10,000.00", body)
        self.assertIn("Reference: reference", body)

    def test_new_user_can_open_birthday_benefits_after_table_rename(self):
        missing = Mock(ok=False, status_code=404)
        missing.json.return_value = {
            "code": "PGRST205",
            "message": "Could not find the table 'public.octogenarian_benefit_applications' in the schema cache",
        }
        empty = Mock(ok=True, status_code=200, content=b"[]")
        empty.json.return_value = []
        profile = Mock(ok=True, status_code=200, content=b"profile")
        profile.json.return_value = [{"id": 7, "dob": "1940-01-01"}]
        with (
            patch.object(memory_service.Config, "SUPABASE_URL", "https://example.test"),
            patch.object(memory_service.Config, "SUPABASE_SERVICE_ROLE_KEY", "test-key"),
            patch.object(memory_service.requests, "request", side_effect=[missing, empty, profile, empty]) as rest,
        ):
            response = backend.app.test_client().get("/api/benefit-applications/user/7")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["applications"], [])
        self.assertTrue(response.json["eligibility"]["can_apply"])
        self.assertTrue(rest.call_args_list[1].args[1].endswith("/birthday_benefit_applications"))
        self.assertEqual(rest.call_args_list[1].kwargs["params"], rest.call_args_list[0].kwargs["params"])

    @patch.object(benefit_applications, "upload_benefit_document", return_value="https://example.test/photo.jpg")
    @patch.object(benefit_applications, "_supabase")
    def test_submissions_only_upload_the_full_body_photo(self, rest, upload):
        client = backend.app.test_client()
        application = {
            "user_id": 7,
            "permanent_address_philippines": "Pateros",
            "contact_number": "09123456789",
            "email_address": "applicant@example.test",
            "full_body_picture_base64": "full-body-photo",
        }
        for legacy_fields in ({}, {"endorsed_list_base64": "legacy-attachment", "endorsed_list_submitted": True}):
            with self.subTest(legacy_fields=legacy_fields):
                rest.reset_mock()
                upload.reset_mock()
                rest.side_effect = [[{"id": 7, "dob": "1935-01-01"}], [], [{"id": "application"}]]
                response = client.post("/api/benefit-applications", json={**application, **legacy_fields})
                self.assertEqual(response.status_code, 201)
                upload.assert_called_once_with(7, "full_body_picture", "full-body-photo", "image/jpeg")
                payload = rest.call_args.kwargs["payload"]
                self.assertTrue(payload["full_body_picture_submitted"])
                self.assertNotIn("endorsed_list_submitted", payload)
                self.assertNotIn("endorsed_list_url", payload)
