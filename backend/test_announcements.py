import unittest
from unittest.mock import patch

import app as backend


class AnnouncementTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()

    @patch.object(backend, "supabase_rest", return_value=[{"id": "new"}])
    @patch.object(backend, "current_session")
    def test_only_osca_can_manage_announcements(self, session, rest):
        for role in ("osca admin", "super admin", "med admin", "user"):
            for method, path in (("POST", "/api/announcements"),
                                 ("PATCH", "/api/announcements/existing"),
                                 ("DELETE", "/api/announcements/existing")):
                with self.subTest(role=role, method=method):
                    with backend.app.app_context():
                        session.return_value = (backend.jsonify({"user": {"id": 7, "role": role}}), 200)
                    rest.reset_mock()
                    response = self.client.open(path, method=method, json={"title": "New", "body": "Update"})
                    if role == "osca admin":
                        self.assertIn(response.status_code, (200, 201))
                        rest.assert_called_once()
                    else:
                        self.assertEqual(response.status_code, 403)
                        rest.assert_not_called()

    @patch.object(backend, "supabase_rest", return_value=[{"id": "published"}])
    def test_published_announcements_remain_public(self, rest):
        response = self.client.get("/api/announcements")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["announcements"], [{"id": "published"}])

    @patch.object(backend, "supabase_rest", return_value=[])
    @patch.object(backend, "require_admin_session", return_value=({"id": 7}, None))
    def test_delete_removes_only_selected_announcement(self, auth, rest):
        response = self.client.delete("/api/announcements/selected-id")
        self.assertEqual(response.status_code, 200)
        rest.assert_called_once_with("DELETE", "announcements", params={"id": "eq.selected-id"})

    @patch.object(backend, "supabase_rest", side_effect=RuntimeError("Deletion failed"))
    @patch.object(backend, "require_admin_session", return_value=({"id": 7}, None))
    def test_delete_failure_returns_error_for_retry(self, auth, rest):
        response = self.client.delete("/api/announcements/selected-id")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json["message"], "Deletion failed")

    @patch.object(backend, "supabase_rest")
    @patch.object(backend, "require_admin_session", return_value=(None, ("Forbidden", 403)))
    def test_delete_requires_admin(self, auth, rest):
        response = self.client.delete("/api/announcements/selected-id")
        self.assertEqual(response.status_code, 403)
        rest.assert_not_called()

    @patch.object(backend, "supabase_rest")
    @patch.object(backend, "require_admin_session", return_value=({"id": 7}, None))
    def test_publish_uses_atomic_replacement(self, auth, rest):
        rest.return_value = [{"id": "new", "title": "New", "body": "Update"}]
        response = self.client.post("/api/announcements", json={
            "title": " New ", "body": " Update ", "image_url": "data:image/jpeg;base64,abc",
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["announcement"]["id"], "new")
        rest.assert_called_once_with("POST", "rpc/replace_announcement", payload={
            "p_title": "New", "p_body": "Update", "p_image_url": "data:image/jpeg;base64,abc",
            "p_published": True, "p_created_by": 7,
        })

    @patch.object(backend, "supabase_rest")
    @patch.object(backend, "require_admin_session", return_value=({"id": 7}, None))
    def test_invalid_upload_does_not_touch_existing_announcement(self, auth, rest):
        response = self.client.post("/api/announcements", json={"title": "", "body": "Update"})
        self.assertEqual(response.status_code, 400)
        rest.assert_not_called()

    @patch.object(backend, "supabase_rest", side_effect=RuntimeError("Publication failed"))
    @patch.object(backend, "require_admin_session", return_value=({"id": 7}, None))
    def test_failed_replacement_is_not_reported_as_success(self, auth, rest):
        response = self.client.post("/api/announcements", json={"title": "New", "body": "Update"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(rest.call_count, 1)

    @patch.object(backend, "supabase_rest")
    @patch.object(backend, "require_admin_session")
    def test_unauthorized_upload_does_not_replace_announcement(self, auth, rest):
        auth.return_value = (None, ("Forbidden", 403))
        response = self.client.post("/api/announcements", json={"title": "New", "body": "Update"})
        self.assertEqual(response.status_code, 403)
        rest.assert_not_called()


if __name__ == "__main__":
    unittest.main()
