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
# Biometric Head Pose & Liveness / Anti-Spoofing Estimation
# ---------------------------------------------------------------------------

def estimate_head_pose(bgr_img: np.ndarray, face_info: np.ndarray) -> Dict[str, Any]:
    """
    Estimates 3D head orientation (Yaw, Pitch, Roll) and landmark symmetry
    from 5 YuNet facial landmarks (eyes, nose, mouth corners).
    """
    if bgr_img is None or face_info is None or len(face_info) < 15:
        return {
            "yaw": 0.0,
            "pitch": 0.0,
            "roll": 0.0,
            "symmetry": 0.0,
            "pose": "UNKNOWN"
        }

    h, w = bgr_img.shape[:2]

    # YuNet landmark indices:
    # 4: right eye x, 5: right eye y
    # 6: left eye x,  7: left eye y
    # 8: nose tip x,  9: nose tip y
    # 10: right mouth x, 11: right mouth y
    # 12: left mouth x,  13: left mouth y
    re = np.array([face_info[4], face_info[5]], dtype=np.float64)
    le = np.array([face_info[6], face_info[7]], dtype=np.float64)
    nt = np.array([face_info[8], face_info[9]], dtype=np.float64)
    rcm = np.array([face_info[10], face_info[11]], dtype=np.float64)
    lcm = np.array([face_info[12], face_info[13]], dtype=np.float64)

    # 1. Landmark Symmetry Ratio
    eye_span = float(np.linalg.norm(le - re))
    eye_mid = (re + le) / 2.0
    mouth_mid = (rcm + lcm) / 2.0
    chin_approx = mouth_mid + (mouth_mid - eye_mid) * 0.45

    if eye_span > 1e-4:
        eye_dir = (le - re) / eye_span
        nose_offset = nt - eye_mid
        horizontal_proj = float(np.dot(nose_offset, eye_dir))
        symmetry_ratio = float(horizontal_proj / (eye_span * 0.5))
    else:
        symmetry_ratio = 0.0

    # 2. 3D Pose Estimation via solvePnP
    yaw, pitch, roll = 0.0, 0.0, 0.0
    try:
        image_points = np.array([
            nt,           # Nose tip
            chin_approx,  # Chin
            re,           # Right eye
            le,           # Left eye
            rcm,          # Right mouth
            lcm           # Left mouth
        ], dtype=np.float64)

        model_points = np.array([
            (0.0, 0.0, 0.0),             # Nose tip
            (0.0, -65.0, -10.0),         # Chin
            (-32.0, 30.0, -30.0),        # Right eye
            (32.0, 30.0, -30.0),         # Left eye
            (-25.0, -32.0, -30.0),       # Right mouth
            (25.0, -32.0, -30.0)         # Left mouth
        ], dtype=np.float64)

        focal_length = float(w)
        cam_center = (w / 2.0, h / 2.0)
        cam_matrix = np.array([
            [focal_length, 0, cam_center[0]],
            [0, focal_length, cam_center[1]],
            [0, 0, 1]
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        success, rvec, _ = cv2.solvePnP(
            model_points,
            image_points,
            cam_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE
        )

        if success:
            rmat, _ = cv2.Rodrigues(rvec)
            angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
            pitch = float(angles[0])
            yaw = float(angles[1])
            roll = float(angles[2])
    except Exception as exc:
        print(f"[AUREA Face] Pose estimation solver fallback: {exc}")

    # 3. Pose Classification
    if symmetry_ratio <= -0.18 or yaw >= 10.0:
        pose = "LEFT"
    elif symmetry_ratio >= 0.18 or yaw <= -10.0:
        pose = "RIGHT"
    elif abs(symmetry_ratio) < 0.28:
        pose = "CENTER"
    else:
        pose = "SLIGHT_TURN"

    return {
        "yaw": round(yaw, 2),
        "pitch": round(pitch, 2),
        "roll": round(roll, 2),
        "symmetry": round(symmetry_ratio, 3),
        "pose": pose
    }


def verify_liveness(captures: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates dynamic 3D liveness & anti-spoofing across Center, Left, and Right captures.
    Ensures:
      1. Real human face detected in all angles.
      2. Poses demonstrate actual head turning (Center, Left, Right).
      3. Disparity between Left and Right symmetries proves 3D volume (anti 2D-photo attack).
    """
    center_raw = captures.get("center")
    left_raw = captures.get("left")
    right_raw = captures.get("right")

    if center_raw is None or left_raw is None or right_raw is None:
        return {
            "passed": False,
            "message": "Incomplete verification frames. Please provide Center, Left, and Right angle captures.",
            "angles": {}
        }

    center_bgr = decode_image(center_raw)
    left_bgr = decode_image(left_raw)
    right_bgr = decode_image(right_raw)

    if center_bgr is None or left_bgr is None or right_bgr is None:
        return {
            "passed": False,
            "message": "One or more camera captures could not be decoded. Please try again.",
            "angles": {}
        }

    # Detect faces
    c_ok, c_face, c_msg = detect_face(center_bgr)
    if not c_ok:
        return {"passed": False, "message": f"Center face capture: {c_msg}", "angles": {}}

    l_ok, l_face, l_msg = detect_face(left_bgr)
    if not l_ok:
        return {"passed": False, "message": f"Left angle capture: {l_msg}", "angles": {}}

    r_ok, r_face, r_msg = detect_face(right_bgr)
    if not r_ok:
        return {"passed": False, "message": f"Right angle capture: {r_msg}", "angles": {}}

    # Pose estimations
    c_pose = estimate_head_pose(center_bgr, c_face)
    l_pose = estimate_head_pose(left_bgr, l_face)
    r_pose = estimate_head_pose(right_bgr, r_face)

    # Angular disparity check: Left vs Right must show distinct 3D head movement
    disparity = abs(l_pose["symmetry"] - r_pose["symmetry"])

    angles_info = {
        "center": c_pose,
        "left": l_pose,
        "right": r_pose,
        "disparity": round(disparity, 3)
    }

    # Anti-spoofing check 1: Center should not be excessively turned
    if abs(c_pose["symmetry"]) > 0.40:
        return {
            "passed": False,
            "message": "Center capture is not looking straight. Please face the camera directly.",
            "angles": angles_info
        }

    # Anti-spoofing check 2: Left and Right must not be identical static photos
    if disparity < 0.22:
        return {
            "passed": False,
            "message": "Liveness check failed: Head turning not detected. Please visibly turn your head to the left and right.",
            "angles": angles_info
        }

    # Anti-spoofing check 3: Cross-matching embedding consistency across captures
    c_feat = extract_features(center_bgr, c_face)
    l_feat = extract_features(left_bgr, l_face)
    r_feat = extract_features(right_bgr, r_face)

    if c_feat is not None and l_feat is not None and r_feat is not None:
        _, recognizer = _get_engine()
        c_l_match = float(recognizer.match(c_feat, l_feat, cv2.FaceRecognizerSF_FR_COSINE))
        c_r_match = float(recognizer.match(c_feat, r_feat, cv2.FaceRecognizerSF_FR_COSINE))

        # Check that center matches left and right captures (same living person)
        if c_l_match < 0.15 or c_r_match < 0.15:
            return {
                "passed": False,
                "message": "Liveness check failed: Inconsistent biometric captures across angles.",
                "angles": angles_info
            }

    return {
        "passed": True,
        "message": "3D Liveness confirmed! Real human movement validated across all angles.",
        "angles": angles_info
    }


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


def verify_liveness_and_faces(
    reference_data: Any,
    live_captures: Dict[str, Any],
    threshold: float = SFACE_COSINE_THRESHOLD
) -> Dict[str, Any]:
    """
    Performs full 3D Liveness verification (Center, Left, Right head angles)
    and biometrically matches against the enrolled profile reference photo.
    """
    # 1. 3D Liveness & Anti-Spoofing Check
    liveness_res = verify_liveness(live_captures)
    if not liveness_res["passed"]:
        return {
            "verified": False,
            "liveness_passed": False,
            "confidence": 0.0,
            "score": 0.0,
            "angles": liveness_res.get("angles", {}),
            "message": liveness_res["message"]
        }

    # 2. Match Center Capture against Enrolled Reference Photo
    ref_img = decode_image(reference_data)
    center_img = decode_image(live_captures.get("center"))

    if ref_img is None:
        return {
            "verified": False,
            "liveness_passed": True,
            "confidence": 0.0,
            "score": 0.0,
            "message": "Unable to read registered profile reference photo."
        }

    if center_img is None:
        return {
            "verified": False,
            "liveness_passed": True,
            "confidence": 0.0,
            "score": 0.0,
            "message": "Unable to decode live center photo for matching."
        }

    ref_ok, ref_face, ref_msg = detect_face(ref_img)
    if not ref_ok:
        return {
            "verified": False,
            "liveness_passed": True,
            "confidence": 0.0,
            "score": 0.0,
            "message": f"Registered profile photo issue: {ref_msg}"
        }

    live_ok, live_face, live_msg = detect_face(center_img)
    if not live_ok:
        return {
            "verified": False,
            "liveness_passed": True,
            "confidence": 0.0,
            "score": 0.0,
            "message": live_msg
        }

    ref_feat = extract_features(ref_img, ref_face)
    live_feat = extract_features(center_img, live_face)

    if ref_feat is None or live_feat is None:
        return {
            "verified": False,
            "liveness_passed": True,
            "confidence": 0.0,
            "score": 0.0,
            "message": "Failed to extract facial biometric features. Please try again with clear lighting."
        }

    _, recognizer = _get_engine()
    score = float(recognizer.match(ref_feat, live_feat, cv2.FaceRecognizerSF_FR_COSINE))
    confidence = calculate_match_confidence(score)
    is_match = score >= threshold

    if is_match:
        message = "Facial verification successful! 3D Liveness & Identity confirmed."
    else:
        message = "Facial verification failed: The face captured does not match the registered account profile. Please try again in good lighting or contact OSCA for assistance."

    return {
        "verified": is_match,
        "liveness_passed": True,
        "confidence": confidence,
        "score": round(score, 4),
        "angles": liveness_res.get("angles", {}),
        "message": message
    }


def verify_faces(reference_data: Any, live_data: Any, threshold: float = SFACE_COSINE_THRESHOLD) -> Dict[str, Any]:
    """
    Verifies whether the live capture(s) match the enrolled reference photo.
    Supports both multi-angle dictionary format:
      {"center": ..., "left": ..., "right": ...}
    and single-image fallback.
    """
    # If dictionary containing multi-angle captures
    if isinstance(live_data, dict) and ("center" in live_data or "left" in live_data or "right" in live_data):
        return verify_liveness_and_faces(reference_data, live_data, threshold)

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

    pose_info = estimate_head_pose(live_img, live_face)

    if is_match:
        message = "Facial verification successful! Identity confirmed."
    else:
        message = "Facial verification failed: The face captured does not match the registered account profile. Please try again in good lighting or contact OSCA for assistance."

    return {
        "verified": is_match,
        "confidence": confidence,
        "score": round(score, 4),
        "pose": pose_info,
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

    pose = estimate_head_pose(img, face_info)
    if abs(pose["symmetry"]) > 0.40:
        return {
            "valid": False,
            "message": "Profile photo must be facing directly forward. Please center your face."
        }

    return {"valid": True, "message": "Face photo is clear and ready for biometric enrollment."}
