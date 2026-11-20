import base64
from io import BytesIO
import unittest
from unittest.mock import patch

from PIL import Image

import app as backend


class PhysicalIdApplicationsTests(unittest.TestCase):
    @patch.object(backend, "supabase_rest")
    def test_financial_assistance_medical_reuses_claimant_id(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        rest.side_effect = [[], [{"id": "aics", "status": "Pending"}]]
        response = self.client.post("/api/financial-assistance", json={
            "requestType": "medical", "confirmed": True,
            "attachments": {key: self.photo for key in ("indigency_clearance", "voter_proof", "medical_document")},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args.args, ("POST", "financial_assistance_applications"))
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["attachments"]["senior_id"], {"onFile": "AG-0007"})
        self.assertNotIn("death_certificate", payload["attachments"])

    @patch.object(backend, "supabase_rest")
    def test_burial_accepts_younger_claimant_and_requires_deceased_identification(self, rest):
        self.profile["dob"] = "2000-01-01"
        rest.side_effect = [[], [], [{"id": "burial", "status": "Pending"}]]
        attachments = {key: self.photo for key in ("senior_id", "indigency_clearance", "death_certificate")}
        data = {"requestType": "burial", "confirmed": True, "beneficiary": "Pedro Reyes"}
        missing = self.client.post("/api/financial-assistance", json={**data, "attachments": attachments})
        self.assertEqual(missing.status_code, 400)
        self.assertIn("Valid ID ng yumao", missing.json["message"])
        response = self.client.post("/api/financial-assistance", json={
            **data, "attachments": {**attachments, "deceased_id": self.photo},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args.kwargs["payload"]["applicant"]["beneficiary"], "Pedro Reyes")

    def setUp(self):
        self.client = backend.app.test_client()
        self.profile = {
            "id": 7, "role": "user", "firstName": "Ana", "lastName": "Reyes",
            "dob": "1950-01-01", "contact": "09123456789", "address": "Aguho, Pateros",
            "birthcert": "https://example.test/birth.pdf", "avatarUrl": "https://example.test/portrait.jpg",
            "signature": "saved signature",
        }
        session = patch.object(backend, "current_session", side_effect=self.current_session)
        self.addCleanup(session.stop)
        session.start()
        stored = BytesIO()
        Image.new("RGB", (12, 12)).save(stored, "JPEG")
        self.photo = base64.b64encode(stored.getvalue()).decode()

    def current_session(self):
        return backend.jsonify({"user": self.profile}), 200

    @patch.object(backend, "supabase_rest")
    def test_first_card_reuses_profile_files_and_disregards_client_user_id(self, rest):
        rest.side_effect = [[], [{"id": "reference", "status": "Pending"}]]
        response = self.client.post("/api/physical-id", json={
            "user_id": 999, "requestType": "new", "confirmed": True,
            "attachments": {"government_id": self.photo, "residency": self.photo},
        })
        self.assertEqual(response.status_code, 201)
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["user_id"], 7)
        self.assertEqual(payload["attachments"]["birth_certificate"]["onFile"], self.profile["birthcert"])
        self.assertEqual(payload["attachments"]["portrait"]["onFile"], self.profile["avatarUrl"])
        self.assertEqual(payload["applicant"]["signature"], self.profile["signature"])

    @patch.object(backend, "supabase_rest", return_value=[])
    def test_lost_card_and_representative_have_their_own_documents(self, rest):
        response = self.client.get("/api/physical-id?requestType=lost&represented=true")
        documents = response.json["requirements"]["documents"]
        self.assertEqual({item["key"] for item in documents if not item["onFile"]}, {
            "government_id", "affidavit", "authorization", "representative_id",
        })
        response = self.client.post("/api/physical-id", json={
            "requestType": "lost", "confirmed": True, "attachments": {"government_id": self.photo},
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("Affidavit of Loss", response.json["message"])
        self.assertTrue(all(call.args[0] == "GET" for call in rest.call_args_list))

    @patch.object(backend, "supabase_rest")
    def test_returned_application_reuses_attachments_for_same_request_type(self, rest):
        rest.side_effect = [
            [{"id": "previous", "status": "Returned", "request_type": "new"}],
            [{"attachments": {"government_id": {"jpeg": self.photo}}}],
            [{"id": "resubmitted", "status": "Pending"}],
        ]
        response = self.client.post("/api/physical-id", json={
            "requestType": "new", "confirmed": True, "attachments": {"residency": self.photo},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args.kwargs["payload"]["attachments"]["government_id"]["jpeg"], self.photo)

    @patch.object(backend, "supabase_rest", return_value=[{"status": "Pending"}])
    def test_duplicate_submission_is_blocked(self, rest):
        response = self.client.post("/api/physical-id", json={"requestType": "new"})
        self.assertEqual(response.status_code, 409)
        rest.assert_called_once()

    @patch.object(backend, "supabase_rest")
    def test_review_is_restricted_and_requires_pickup_instructions(self, rest):
        path = "/api/physical-id/admin/987aa56d-fa9d-4dca-9984-90adcf96620c"
        self.assertEqual(self.client.get(path).status_code, 403)
        rest.assert_not_called()
        self.profile["role"] = "osca admin"
        rest.side_effect = [[{"status": "Pending"}], [{"status": "Pending"}], [], [{"status": "Ready for pickup"}]]
        response = self.client.patch(path, json={"status": "Ready for pickup"})
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(path, json={"status": "Ready for pickup", "note": "Pick up at the OSCA desk."})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rest.call_args_list[2].kwargs["params"]["status"], "eq.Pending")

    @patch.object(backend, "supabase_rest")
    def test_philhealth_reuses_osca_id_and_government_id_from_released_request(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        self.profile["signature"] = None
        rest.side_effect = [[], [{"government_id": {"jpeg": self.photo}}], [{"status": "Pending"}]]
        response = self.client.post("/api/philhealth", json={
            "confirmed": True, "attachments": {"pmrf": self.photo},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args_list[1].kwargs["params"]["status"], "eq.Released")
        self.assertEqual(rest.call_args.args, ("POST", "philhealth_applications"))
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["attachments"]["senior_id"], {"onFile": "AG-0007"})
        self.assertEqual(payload["attachments"]["government_id"], {"jpeg": self.photo})
        self.assertTrue(payload["applicant"]["indigency_declared"])
        self.assertNotIn("signature", payload["applicant"])

    @patch.object(backend, "supabase_rest", return_value=[])
    def test_philhealth_requires_pmrf_and_lists_representative_documents_when_needed(self, rest):
        response = self.client.get("/api/philhealth?represented=true")
        documents = response.json["requirements"]["documents"]
        self.assertEqual({item["key"] for item in documents}, {
            "pmrf", "senior_id", "government_id", "authorization", "representative_id",
        })
        response = self.client.post("/api/philhealth", json={
            "confirmed": True, "attachments": {"government_id": self.photo, "senior_id": self.photo},
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("PMRF", response.json["message"])
        self.assertTrue(all(call.args[0] == "GET" for call in rest.call_args_list))

    @patch.object(backend, "supabase_rest")
    def test_only_authorized_staff_can_record_philhealth_endorsement(self, rest):
        path = "/api/philhealth/admin/987aa56d-fa9d-4dca-9984-90adcf96620c"
        decision = {"status": "Endorsed", "note": "OSCA sent the application to PhilHealth."}
        self.assertEqual(self.client.patch(path, json=decision).status_code, 403)
        rest.assert_not_called()
        self.profile["role"] = "osca admin"
        rest.side_effect = [[{"status": "Pending"}], [], [{"status": "Endorsed"}]]
        self.assertEqual(self.client.patch(path, json=decision).status_code, 200)
        self.assertEqual(rest.call_args_list[1].args, ("PATCH", "philhealth_applications"))

    @patch.object(backend, "supabase_rest")
    def test_social_pension_reuses_osca_id_and_portrait(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        rest.side_effect = [[], [{"status": "Pending"}]]
        response = self.client.post("/api/social-pension", json={
            "confirmed": True, "attachments": {"pension_intake": self.photo, "indigency_certificate": self.photo},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args.args, ("POST", "social_pension_applications"))
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["attachments"]["senior_id"], {"onFile": "AG-0007"})
        self.assertEqual(payload["attachments"]["portrait"], {"onFile": self.profile["avatarUrl"]})

    @patch.object(backend, "supabase_rest", return_value=[])
    def test_social_pension_checks_age_and_requires_indigency_certificate(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        data = {"confirmed": True, "attachments": {"pension_intake": self.photo}}
        response = self.client.post("/api/social-pension", json=data)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Certificate of Indigency", response.json["message"])
        self.profile["dob"] = "2000-01-01"
        response = self.client.post("/api/social-pension", json=data)
        self.assertEqual(response.status_code, 400)
        self.assertIn("edad 60", response.json["message"])
        self.assertTrue(all(call.args[0] == "GET" for call in rest.call_args_list))

    @patch.object(backend, "supabase_rest")
    def test_social_pension_can_record_approval_only_after_endorsement(self, rest):
        self.profile["role"] = "osca admin"
        path = "/api/social-pension/admin/987aa56d-fa9d-4dca-9984-90adcf96620c"
        decision = {"status": "Approved", "note": "Confirmed on the DSWD-NCR approved list."}
        rest.side_effect = [[{"status": "Pending"}], [{"status": "Endorsed"}], [], [{"status": "Approved"}]]
        self.assertEqual(self.client.patch(path, json=decision).status_code, 409)
        self.assertEqual(self.client.patch(path, json=decision).status_code, 200)
        self.assertEqual(rest.call_args_list[2].kwargs["params"]["status"], "eq.Endorsed")

    @patch.object(backend, "supabase_rest")
    def test_purchase_booklet_reuses_osca_id_without_extras(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        self.profile["signature"] = None
        rest.side_effect = [[], [{"status": "Pending"}]]
        response = self.client.post("/api/purchase-booklet", json={
            "confirmed": True, "requestType": "lost", "attachments": {},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args.args, ("POST", "purchase_booklet_applications"))
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["attachments"], {"senior_id": {"onFile": "AG-0007"}})
        self.assertNotIn("signature", payload["applicant"])

    @patch.object(backend, "supabase_rest", return_value=[])
    def test_purchase_booklet_requests_representative_documents_only_when_applicable(self, rest):
        response = self.client.get("/api/purchase-booklet?requestType=new")
        self.assertEqual([item["key"] for item in response.json["requirements"]["documents"]], ["senior_id"])
        response = self.client.get("/api/purchase-booklet?requestType=worn&represented=true")
        self.assertEqual(
            [item["key"] for item in response.json["requirements"]["documents"]],
            ["senior_id", "authorization", "representative_id"],
        )
        response = self.client.post("/api/purchase-booklet", json={
            "confirmed": True, "requestType": "worn", "representative": "Juan Reyes",
            "attachments": {"senior_id": self.photo},
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("authorization", response.json["message"])

    @patch.object(backend, "supabase_rest")
    def test_transfer_reuses_osca_id_and_preserves_original_profile_address(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        rest.side_effect = [[], [{"status": "Pending"}]]
        response = self.client.post("/api/osca-transfer", json={
            "confirmed": True, "destination": "18 Main Street, Bagong Ilog, Pasig",
            "attachments": {"transfer_residency": self.photo},
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rest.call_args.args, ("POST", "osca_transfer_applications"))
        payload = rest.call_args.kwargs["payload"]
        self.assertEqual(payload["applicant"]["address"], self.profile["address"])
        self.assertEqual(payload["applicant"]["destination"], "18 Main Street, Bagong Ilog, Pasig")
        self.assertEqual(payload["attachments"]["senior_id"], {"onFile": "AG-0007"})
        self.assertNotIn("indigency_declared", payload["applicant"])

    @patch.object(backend, "supabase_rest")
    def test_transfer_requires_new_barangay_certificate_if_destination_changes(self, rest):
        self.profile["oscaIdNumber"] = "AG-0007"
        previous = {"destination": "Old destination", "attachments": {"transfer_residency": {"jpeg": self.photo}}}
        rest.side_effect = [[{"id": "old", "status": "Returned", "request_type": "transfer"}], [previous]]
        response = self.client.post("/api/osca-transfer", json={
            "confirmed": True, "destination": "Different destination", "attachments": {},
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("Barangay Certificate", response.json["message"])
        self.assertTrue(all(call.args[0] == "GET" for call in rest.call_args_list))
