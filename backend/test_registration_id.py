import ast
import base64
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from PIL import Image
from services.registration_id import normalize_id_details, scan_registration_id

class RegistrationIdTests(unittest.TestCase):
    def setUp(self):
        self.details = {"isSeniorCitizenId": True, "firstName": "Juan", "middleName": "M.",
                        "lastName": "Dela Cruz", "dob": "1944-09-14", "idNumber": "PB-0024",
                        "barangay": "Poblacion", "houseNo": "12", "street": "A. Mabini"}

    def test_normalizes_birthday_and_preserves_initials(self):
        result = normalize_id_details(self.details)
        self.assertEqual(result["dob"], "09/14/1944")
        self.assertEqual(result["middleName"], "M.")
        self.assertEqual(result["contact"], "")

    def test_rejects_non_ids_missing_fields_and_invalid_birthdays(self):
        for patch_data in [{"isSeniorCitizenId": False}, {"idNumber": ""}, {"firstName": ""},
                           {"dob": "unreadable"}, {"dob": "2020-01-01"}, {"dob": "1944-02-31"}]:
            with self.subTest(data=patch_data), self.assertRaises(ValueError):
                normalize_id_details({**self.details, **patch_data})

    def image(self):
        stream = io.BytesIO()
        Image.new("RGB", (20, 20)).save(stream, format="PNG")
        return base64.b64encode(stream.getvalue()).decode()

    def test_scanner_uses_http_api_and_detects_actual_image_type(self):
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {"candidates": [{"content": {"parts": [{"text": json.dumps(self.details)}]}}]}
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), patch("services.registration_id.requests.post", return_value=response) as post:
            self.assertEqual(scan_registration_id(self.image(), "image/jpeg")["idNumber"], "PB-0024")
        options = post.call_args.kwargs
        self.assertEqual(options["json"]["contents"][0]["parts"][0]["inlineData"]["mimeType"], "image/png")
        self.assertEqual(options["json"]["generationConfig"]["responseMimeType"], "application/json")
        self.assertIn("timeout", options)

    def test_no_sample_fallback_when_ocr_unavailable(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}), self.assertRaises(RuntimeError):
            scan_registration_id(self.image(), "image/png")

    def test_invalid_upload_rejected_before_ocr(self):
        with patch("services.registration_id.requests.post") as post, self.assertRaises(ValueError):
            scan_registration_id("not an image", "image/jpeg")
        post.assert_not_called()

    def test_quota_error_is_actionable(self):
        response = Mock(status_code=429, ok=False)
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), patch("services.registration_id.requests.post", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "service limit"):
                scan_registration_id(self.image(), "image/png")

    def test_duplicate_id_is_not_returned_as_available(self):
        tree = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "scan_senior_id"]
        functions[0].decorator_list = []
        signer = SimpleNamespace(dumps=Mock(return_value="signed-token"))
        context = {"request": SimpleNamespace(get_json=lambda **kwargs: {"image": "test"}),
                   "scan_registration_id": lambda *args: self.details,
                   "registered_senior_id": lambda number: True,
                   "jsonify": lambda data: data, "registration_id_signer": signer}
        exec(compile(ast.Module(body=functions, type_ignores=[]), "scan-route", "exec"), context)
        response, status = context["scan_senior_id"]()
        self.assertEqual(status, 409)
        self.assertNotIn("details", response)
        signer.dumps.assert_not_called()

    def test_registration_checks_token_and_duplicate_before_creating_user(self):
        tree = ast.parse(Path(__file__).with_name("app.py").read_text(encoding="utf-8"))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "register")
        function.decorator_list = []
        rest = Mock()
        signer = SimpleNamespace(loads=Mock(return_value={"idNumber": "PB-0024"}))
        context = {"request": SimpleNamespace(method="POST", get_json=lambda **kwargs: {"hasExistingSeniorId": True}),
                   "registration_id_signer": signer, "registered_senior_id": lambda number: True,
                   "BadSignature": ValueError, "jsonify": lambda data: data, "supabase_rest": rest}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "register-route", "exec"), context)
        self.assertEqual(context["register"]()[1], 409)
        rest.assert_not_called()
        signer.loads.side_effect = ValueError("expired")
        self.assertEqual(context["register"]()[1], 400)
        rest.assert_not_called()

if __name__ == "__main__":
    unittest.main()
