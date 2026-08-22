import base64
import io
import os
import urllib.request
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Model Configuration & Auto-Download
# ---------------------------------------------------------------------------

MODELS_DIR = Path(__file__).resolve().parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

YUNET_PATH = MODELS_DIR / "face_detection_yunet.onnx"
SFACE_PATH = MODELS_DIR / "face_recognition_sface.onnx"

YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"

# SFace cosine similarity threshold (Standard OpenCV SFace matching threshold is 0.363)
# Any score >= 0.363 indicates the same person.
SFACE_COSINE_THRESHOLD = 0.363

_detector = None
_recognizer = None


def _ensure_models() -> None:
    """Download ONNX models if they do not already exist locally."""
    if not YUNET_PATH.exists() or YUNET_PATH.stat().st_size < 100_000:
        print("[AUREA Face] Downloading YuNet face detection model...")
        urllib.request.urlretrieve(YUNET_URL, str(YUNET_PATH))
        print("[AUREA Face] YuNet downloaded successfully.")

    if not SFACE_PATH.exists() or SFACE_PATH.stat().st_size < 1_000_000:
        print("[AUREA Face] Downloading SFace face recognition model...")
        urllib.request.urlretrieve(SFACE_URL, str(SFACE_PATH))
        print("[AUREA Face] SFace downloaded successfully.")


def _get_engine():
    """Lazy-initialize OpenCV YuNet detector and SFace recognizer."""
    global _detector, _recognizer
    if _detector is None or _recognizer is None:
        _ensure_models()
        _detector = cv2.FaceDetectorYN.create(str(YUNET_PATH), "", (320, 320), score_threshold=0.6, nms_threshold=0.3)
        _recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
        print("[AUREA Face] Biometric AI models loaded and ready.")
    return _detector, _recognizer


# ---------------------------------------------------------------------------
# Image Preprocessing & Decoding
# ---------------------------------------------------------------------------

def decode_image(data: Any) -> Optional[np.ndarray]:
    """
    Accepts raw bytes, base64 string, or data URI and converts to an OpenCV BGR ndarray.
    """
    if data is None:
        return None

    # If already a numpy image
    if isinstance(data, np.ndarray):
        return data

    try:
        raw_bytes = None
        if isinstance(data, str):
            # Strip data URI header if present (e.g. data:image/jpeg;base64,...)
            if "," in data:
                data = data.split(",", 1)[1]
            raw_bytes = base64.b64decode(data.strip())
        elif isinstance(data, (bytes, bytearray)):
            raw_bytes = bytes(data)

        if not raw_bytes:
            return None

        # Use PIL first to handle orientation and various image formats cleanly
        pil_img = Image.open(io.BytesIO(raw_bytes))
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        # Convert RGB PIL to BGR OpenCV
        np_arr = np.array(pil_img)
        bgr_img = cv2.cvtColor(np_arr, cv2.COLOR_RGB2BGR)
        return bgr_img

    except Exception as exc:
        print(f"[AUREA Face] Image decode error: {exc}")
        return None


# ---------------------------------------------------------------------------
# Face Detection & Feature Extraction
# ---------------------------------------------------------------------------

def detect_face(bgr_img: np.ndarray) -> Tuple[bool, Optional[np.ndarray], str]:
    """
    Detects faces in the given image.
    Returns:
        (success: bool, primary_face_info: np.ndarray, message: str)
    """
    if bgr_img is None or bgr_img.size == 0:
        return False, None, "Invalid or empty image provided."

    detector, _ = _get_engine()
    h, w = bgr_img.shape[:2]

    # Resize large images to reasonable bounds for fast detection (max 1000px)
    max_dim = max(h, w)
    scale = 1.0
    processed_img = bgr_img
    if max_dim > 1000:
        scale = 1000.0 / max_dim
        new_w, new_h = int(w * scale), int(h * scale)
        processed_img = cv2.resize(bgr_img, (new_w, new_h))
        h, w = new_h, new_w

    detector.setInputSize((w, h))
    _, faces = detector.detect(processed_img)

    if faces is None or len(faces) == 0:
        return False, None, "No face detected. Please ensure your face is well-lit, centered, and facing the camera directly."

    # If scaled, rescale face coordinates back to original image
    primary_face = faces[0].copy()
    if scale != 1.0:
        # faces format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
        primary_face[:-1] = primary_face[:-1] / scale

    return True, primary_face, "Face detected successfully."


def extract_features(bgr_img: np.ndarray, face_info: np.ndarray) -> Optional[np.ndarray]:
    """
    Aligns and crops the face using detected landmarks, then extracts 128-D feature vector.
    """
    try:
        _, recognizer = _get_engine()
        aligned_face = recognizer.alignCrop(bgr_img, face_info)
        features = recognizer.feature(aligned_face)
        return features
    except Exception as exc:
        print(f"[AUREA Face] Feature extraction error: {exc}")
        return None


# ---------------------------------------------------------------------------
# Biometric Face Verification
# ---------------------------------------------------------------------------

def calculate_match_confidence(cosine_score: float) -> float:
    """
    Converts SFace cosine similarity score (typically between -0.2 and 0.9)
    into an intuitive percentage (0 - 100%).
    Threshold is 0.363 (maps to ~75%).
    """
    if cosine_score <= 0.0:
        return max(0.0, round((cosine_score + 0.2) * 50.0, 1))
    if cosine_score < SFACE_COSINE_THRESHOLD:
        # Scale between 20% and 74%
        return round(20.0 + (cosine_score / SFACE_COSINE_THRESHOLD) * 54.0, 1)
    # Scale between 75% and 99.9%
    remaining_range = max(0.001, 1.0 - SFACE_COSINE_THRESHOLD)
    above = (cosine_score - SFACE_COSINE_THRESHOLD) / remaining_range
    return min(99.9, round(75.0 + above * 24.9, 1))


def verify_faces(reference_data: Any, live_data: Any, threshold: float = SFACE_COSINE_THRESHOLD) -> Dict[str, Any]:
    """
    Verifies whether the live capture matches the enrolled reference photo.

    Args:
        reference_data: Enrolled photo (bytes, base64, or ndarray)
        live_data: Live selfie capture from camera (bytes, base64, or ndarray)
        threshold: Cosine similarity cutoff (default: 0.363)

    Returns:
        Dict with keys: verified (bool), confidence (float), score (float), message (str)
    """
    ref_img = decode_image(reference_data)
    live_img = decode_image(live_data)

    if ref_img is None:
        return {
            "verified": False,
            "confidence": 0.0,
            "score": 0.0,
            "message": "Unable to read registered profile reference photo."
        }

    if live_img is None:
        return {
            "verified": False,
            "confidence": 0.0,
            "score": 0.0,
            "message": "Unable to process live camera image. Please try capturing again."
        }

    # 1. Detect face in reference image
    ref_ok, ref_face, ref_msg = detect_face(ref_img)
    if not ref_ok:
        return {
            "verified": False,
            "confidence": 0.0,
            "score": 0.0,
            "message": f"Registered profile photo issue: {ref_msg}"
        }

    # 2. Detect face in live capture
    live_ok, live_face, live_msg = detect_face(live_img)
    if not live_ok:
        return {
            "verified": False,
            "confidence": 0.0,
            "score": 0.0,
            "message": live_msg
        }

    # 3. Extract features
    ref_feat = extract_features(ref_img, ref_face)
    live_feat = extract_features(live_img, live_face)

    if ref_feat is None or live_feat is None:
        return {
            "verified": False,
            "confidence": 0.0,
            "score": 0.0,
            "message": "Failed to extract facial biometric features. Please try again with clear lighting."
        }

    # 4. Compare feature embeddings via Cosine Distance
    _, recognizer = _get_engine()
    score = float(recognizer.match(ref_feat, live_feat, cv2.FaceRecognizerSF_FR_COSINE))
    confidence = calculate_match_confidence(score)
    is_match = score >= threshold

    if is_match:
        message = "Facial verification successful! Identity confirmed."
    else:
        message = "Facial verification failed: The face captured does not match the registered account profile. Please try again in good lighting or contact OSCA for assistance."

    return {
        "verified": is_match,
        "confidence": confidence,
        "score": round(score, 4),
        "message": message
    }


def validate_enrollment_photo(image_data: Any) -> Dict[str, Any]:
    """
    Validates that a photo is suitable for face enrollment (contains a clear face).
    """
    img = decode_image(image_data)
    if img is None:
        return {"valid": False, "message": "Invalid image file format."}

    ok, face_info, msg = detect_face(img)
    if not ok:
        return {"valid": False, "message": msg}

    feat = extract_features(img, face_info)
    if feat is None:
        return {"valid": False, "message": "Could not extract facial features. Please ensure your face is unobscured."}

    return {"valid": True, "message": "Face photo is clear and ready for biometric enrollment."}
