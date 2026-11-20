import unittest
from unittest.mock import patch

import app as backend
from routes import benefit_applications


class BirthdayBenefitApplicationTests(unittest.TestCase):
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
