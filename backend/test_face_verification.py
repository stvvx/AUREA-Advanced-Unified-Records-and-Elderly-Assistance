import base64
import io
import unittest
import numpy as np
from PIL import Image, ImageDraw
import cv2

import face_verifier
from app import app


def create_mock_face_image(seed=42):
    """
    Draws a simple synthetic face-like structure (oval, eyes, nose, mouth) for pipeline testing.
    """
    img = Image.new("RGB", (320, 320), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    # Face skin oval
    draw.ellipse([70, 50, 250, 270], fill=(235, 195, 160), outline=(180, 140, 110), width=2)
    # Eyes
    draw.ellipse([105, 115, 135, 135], fill=(50, 30, 20))
    draw.ellipse([185, 115, 215, 135], fill=(50, 30, 20))
    # Nose
    draw.line([(160, 135), (160, 175)], fill=(150, 100, 70), width=3)
    # Mouth
    draw.arc([120, 185, 200, 225], start=0, end=180, fill=(180, 50, 50), width=4)

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class FaceVerificationUnitTests(unittest.TestCase):

    def test_image_decoding(self):
        raw_bytes = create_mock_face_image()
        bgr = face_verifier.decode_image(raw_bytes)
        self.assertIsNotNone(bgr)
        self.assertEqual(bgr.shape, (320, 320, 3))

        # Base64 decode
        b64 = "data:image/jpeg;base64," + base64.b64encode(raw_bytes).decode("utf-8")
        bgr_b64 = face_verifier.decode_image(b64)
        self.assertIsNotNone(bgr_b64)
        self.assertEqual(bgr_b64.shape, (320, 320, 3))

    def test_no_face_detection_on_blank_image(self):
        blank = np.zeros((300, 300, 3), dtype=np.uint8)
        ok, face, msg = face_verifier.detect_face(blank)
        self.assertFalse(ok)
        self.assertIn("No face detected", msg)

    def test_confidence_calculator(self):
        # Negative / zero score
        self.assertEqual(face_verifier.calculate_match_confidence(-0.2), 0.0)
        # Below threshold
        c_low = face_verifier.calculate_match_confidence(0.2)
        self.assertTrue(20.0 <= c_low < 75.0)
        # At threshold
        c_thresh = face_verifier.calculate_match_confidence(face_verifier.SFACE_COSINE_THRESHOLD)
        self.assertAlmostEqual(c_thresh, 75.0, delta=1.0)
        # High match score
        c_high = face_verifier.calculate_match_confidence(0.7)
        self.assertTrue(c_high >= 85.0)

    def test_verify_face_endpoint_validation(self):
        client = app.test_client()

        # Missing payload
        res = client.post("/api/auth/verify-face", json={})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json.get("verified"))

        # Missing image
        res = client.post("/api/auth/verify-face", json={"userId": 1})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json.get("verified"))

    def test_enroll_face_endpoint_validation(self):
        client = app.test_client()

        # Missing user
        res = client.post("/api/auth/enroll-face", json={"image": "abc"})
        self.assertEqual(res.status_code, 400)

        # Blank image (no face)
        blank_bytes = io.BytesIO()
        Image.new("RGB", (200, 200), color="white").save(blank_bytes, format="JPEG")
        b64 = base64.b64encode(blank_bytes.getvalue()).decode("utf-8")

        res = client.post("/api/auth/enroll-face", json={"userId": 99999, "image": b64})
        self.assertEqual(res.status_code, 400)
        self.assertIn("No face detected", res.json.get("message", ""))


if __name__ == "__main__":
    unittest.main()
