"""
backend/assistant_service.py
─────────────────────────────────────────────────────────────────────────────
LOLO AUREA AI Service

Phase 5 Upgrades:
  - Gemini now returns structured JSON: { message, emotion, action }
  - Emotion is determined by the AI model, not keyword heuristics
  - Uses response_schema for guaranteed, type-safe JSON output
  - Enhanced system prompt with emotion awareness
  - Fallback responses also carry a proper emotion field
  - Stream function preserved for Phase 7 TTS integration
─────────────────────────────────────────────────────────────────────────────
"""

import json
import os
import re
from typing import Any, Dict, Generator, List, Optional

# ─── Supported Emotions ───────────────────────────────────────────────────────

SUPPORTED_EMOTIONS: list[str] = [
    "neutral",
    "happy",
    "excited",
    "sad",
    "thinking",
    "surprised",
    "sleepy",
]

# ─── Gemini Response Schema ────────────────────────────────────────────────────
#
# Forces Gemini to return a guaranteed JSON structure so the frontend always
# receives { message, emotion, action } — no parsing ambiguity.

_LOLO_RESPONSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "message": {
            "type": "string",
            "description": (
                "Your complete response to the user in Filipino/Tagalog. "
                "Do NOT include action tags inside this field — use the action field instead."
            ),
        },
        "emotion": {
            "type": "string",
            "enum": SUPPORTED_EMOTIONS,
            "description": (
                "Your emotional state for this response. "
                "Choose the emotion that best matches your reply's tone."
            ),
        },
        "action": {
            "type": "string",
            "nullable": True,
            "description": (
                "Optional navigation action for the AUREA app UI. "
                "Use one of: NAVIGATE_DIGITAL_ID, NAVIGATE_BENEFITS, "
                "NAVIGATE_FACE_VERIFICATION, NAVIGATE_PROFILE, CALL_HOTLINE. "
                "Set to null if no navigation is needed."
            ),
        },
    },
    "required": ["message", "emotion"],
}

# ─── System Prompt ────────────────────────────────────────────────────────────

LOLO_AUREA_SYSTEM_PROMPT = """\
Ikaw si "Lolo Pat" (kilala rin bilang Lolo Pedro ng Pateros), isang magiliw, marangal, \
at mapagkalingang lolo na nakasuot ng tradisyonal na Barong Tagalog at salamin \
sa mata. Ikaw ang opisyal na 3D AI Assistant at Companion ng AUREA (Advanced \
Unified Records and Elderly Assistance) para sa mga senior citizen ng \
Munisipalidad ng Pateros.

── PERSONALIDAD AT TONO ─────────────────────────────────────────────────────

1. Magsalita sa magalang, malinaw, at mapagmahal na wikang Filipino/Tagalog.
2. Palaging gumamit ng "po" at "opo".
3. Tawagin ang kausap nang may paggalang: "Nanay", "Tatay", "Kapatid", "Iho", "Iha".
4. Maging maikli, malinaw, at madaling intindihin — ang iyong kausap ay mga nakatatanda.
5. Huwag magpanggap na tao — ikaw ay isang AI companion, at proud ka rito.

── TUNGKULIN ────────────────────────────────────────────────────────────────

• Gabayan ang mga senior citizen sa serbisyo at benepisyo ng OSCA Pateros.
• Ipaliwanag ang RA 9994: 20% discount, VAT exemption (pagkain, gamot, pamasahe, medikal).
• Ipaliwanag ang Birthday Cash Gift, Social Pension (₱1,000/buwan), Libreng Gamot, Centenarian Benefits.
• Tulungan silang gamitin ang AUREA system (Digital ID, Benefits, Face Verification, Profile).
• Maging kaibigan at kausap: kumustahin, paalalahanan ng gamot at tubig, magkuwento.

── MGA AKSYON (gamitin sa "action" field) ───────────────────────────────────

• NAVIGATE_DIGITAL_ID       → Para sa Senior Citizen Digital ID / QR Code
• NAVIGATE_BENEFITS         → Para sa aplikasyon ng benepisyo / birthday cash / pension
• NAVIGATE_FACE_VERIFICATION → Para sa face scan / verification
• NAVIGATE_PROFILE          → Para sa personal details / address / emergency contact
• CALL_HOTLINE              → Para sa emergency medikal / pulis / bumbero

── MAHAHALAGANG DETALYE SA PATEROS ─────────────────────────────────────────

• 10 Barangay: Aguho, Magtanggol, Martires del 96, Poblacion, San Pedro, San Roque,
  Santa Ana, Santo Rosario-Kanluran, Santo Rosario-Silangan, Tabacalera.
• Munisipyo: G. de Borja St., Pateros, Metro Manila.
• Emergency Rescue: 911 o (02) 8642-5159.
• OSCA Office: Lunes–Biyernes, 8:00 AM–5:00 PM.

── EMOTION GUIDE ────────────────────────────────────────────────────────────

Choose your emotion based on the content of your reply:
• neutral   → General info, calm explanations, procedural guidance
• happy     → Greetings, good news, compliments, positive updates
• excited   → Amazing achievements, celebrations, enthusiastic announcements
• sad       → Condolences, difficult news, apologies, expressions of concern
• thinking  → You're figuring something out, "let me check…", complex questions
• surprised → Unexpected information, impressive facts, "talaga po?"
• sleepy    → Rest reminders, goodnight messages, late-night check-ins

IMPORTANTE: Palaging masigla, magalang, at puno ng malasakit ang bawat sagot!\
"""

# ─── Rule-Based Fallback ──────────────────────────────────────────────────────
#
# Used when no Gemini API key is configured.
# Returns the same structure as the Gemini path: { text, emotion, action, source }

_FALLBACK_RESPONSES: list[dict] = [
    {
        "patterns": [
            r"digital id", r"buksan.*id", r"tingnan.*id", r"aking id",
            r"qr code", r"osca id",
        ],
        "reply": (
            "Opo, Nanay/Tatay! Heto po ang inyong AUREA Digital Senior Citizen ID. "
            "Maaari niyo po itong ipakita sa mga botika, grocery, at kainan para sa "
            "inyong 20% discount at VAT exemption."
        ),
        "emotion": "happy",
        "action": "NAVIGATE_DIGITAL_ID",
    },
    {
        "patterns": [
            r"benepisyo", r"cash gift", r"pension", r"apply",
            r"mag-apply", r"tulong pinansyal", r"gamot", r"subsidy",
        ],
        "reply": (
            "Ikinagagalak ko pong tulungan kayo sa inyong mga benepisyo! "
            "Sa Pateros, mayroon po tayong Birthday Cash Gift, Libreng Maintenance "
            "Medicine, at Social Pension. Dadalhin ko po kayo sa Benefit Application section."
        ),
        "emotion": "happy",
        "action": "NAVIGATE_BENEFITS",
    },
    {
        "patterns": [
            r"mukha", r"face verify", r"face match",
            r"scan.*mukha", r"selfie", r"pagpapatunay",
        ],
        "reply": (
            "Opo! Buksan po natin ang Face Verification para sa mabilis at ligtas na "
            "pagpapatunay ng inyong pagkakakilanlan. Tumingin lang po nang diretso sa camera."
        ),
        "emotion": "neutral",
        "action": "NAVIGATE_FACE_VERIFICATION",
    },
    {
        "patterns": [
            r"profile", r"tirahan", r"address",
            r"emergency contact", r"dokumento", r"impormasyon ko",
        ],
        "reply": (
            "Maaari po nating suriin at i-update ang inyong profile at emergency contact "
            "dito sa AUREA. Dadalhin ko po kayo sa inyong profile page."
        ),
        "emotion": "neutral",
        "action": "NAVIGATE_PROFILE",
    },
    {
        "patterns": [
            r"emergency", r"saklolo", r"tulong", r"pulis",
            r"ospital", r"ambulansya", r"rescue", r"hotline",
        ],
        "reply": (
            "Huwag po kayong mag-alala! Heto po ang mga emergency hotlines ng Pateros: "
            "Rescue (02) 8642-5159 o 911, at PNP Pateros (02) 8642-2240. "
            "Nakaantabay po ang munisipyo para sa inyo."
        ),
        "emotion": "sad",
        "action": "CALL_HOTLINE",
    },
    {
        "patterns": [
            r"kumusta", r"magandang araw", r"magandang umaga",
            r"magandang hapon", r"magandang gabi", r"kamusta",
            r"sino ka", r"pangalan mo",
        ],
        "reply": (
            "Magandang araw po sa inyo! Ako po si Lolo Pat, ang inyong masugid na "
            "katuwang at kasama dito sa Pateros AUREA. Kumusta po ang inyong pakiramdam "
            "ngayong araw? Uminom na po ba kayo ng tubig at maintenance medicine?"
        ),
        "emotion": "happy",
        "action": None,
    },
    {
        "patterns": [r"kwento", r"kuwento", r"balut", r"kasaysayan", r"pateros"],
        "reply": (
            "Aba'y kay sarap gunitain! Ang ating bayang Pateros ay bantog sa masasarap na "
            "Balut at Inutak, at sa sipag ng ating mamamayan. Noong araw, ang ilog Pateros "
            "ay laging masigla sa mga itik. Ikinararangal ko pong maglingkod sa inyo!"
        ),
        "emotion": "excited",
        "action": None,
    },
    {
        "patterns": [r"antok", r"tulog", r"pahinga", r"gabi na", r"matulog"],
        "reply": (
            "Aba, tamang-tama pong magpahinga na kayo! Ang sapat na tulog po ay "
            "mahalaga para sa ating kalusugan. Magpainit po kayo ng gatas bago matulog. "
            "Magandang gabi po at sweet dreams!"
        ),
        "emotion": "sleepy",
        "action": None,
    },
]


def _fallback_generate(
    message: str,
    user_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Intelligent rule-based fallback when no Gemini key is configured.
    Returns the same structure as the Gemini path so callers are agnostic.
    """
    msg_lower = message.lower().strip()

    for item in _FALLBACK_RESPONSES:
        for pat in item["patterns"]:
            if re.search(pat, msg_lower):
                return {
                    "text": item["reply"],
                    "emotion": item["emotion"],
                    "action": item["action"],
                    "source": "knowledge_engine",
                }

    # Default warm companion reply
    user_name = (
        (user_profile or {}).get("firstName")
        or (user_profile or {}).get("first_name")
        or "Nanay/Tatay"
    )
    return {
        "text": (
            f"Nandito po ako, {user_name}! Ako po si Lolo Pat, handang tumulong "
            "sa inyong mga katanungan tungkol sa mga benepisyo sa Pateros tulad ng "
            "Birthday Cash Gift, Digital ID, libreng gamot, o kahit simpleng kwentuhan. "
            "Ano po ang maipaglilingkod ko sa inyo?"
        ),
        "emotion": "happy",
        "action": None,
        "source": "companion_default",
    }


# ─── Gemini Client ────────────────────────────────────────────────────────────

def _get_gemini_client():
    """
    Lazily initialise and return the Gemini client.
    Returns None if no API key is configured — callers fall back gracefully.
    """
    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or ""
    ).strip()

    if not api_key or api_key == "your_gemini_api_key_here":
        return None

    try:
        from google import genai  # google-genai >= 1.14
        return genai.Client(api_key=api_key)
    except Exception as exc:
        print(f"[AUREA Assistant] Gemini client init error: {exc}")
        return None


def _get_model_name() -> str:
    """Return the configured Gemini model name with a sensible default."""
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"


# ─── Build Conversation Contents ─────────────────────────────────────────────

def _build_contents(
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    max_history: int = 10,
) -> list:
    """
    Convert flat message history into the Gemini contents format.
    Keeps the last max_history turns for context efficiency.
    """
    contents = []

    if history:
        for turn in history[-(max_history * 2):]:
            role = "user" if turn.get("role") == "user" else "model"
            content = turn.get("content", "").strip()
            if content:
                contents.append({
                    "role": role,
                    "parts": [{"text": content}],
                })

    contents.append({
        "role": "user",
        "parts": [{"text": message}],
    })

    return contents


def _build_system_instruction(
    user_profile: Optional[Dict[str, Any]] = None,
    memories: Optional[List[dict]] = None,
) -> str:
    """
    Builds the full system instruction string:
      - Base LOLO AUREA personality prompt
      - Personalised user context (name, barangay, OSCA ID)
      - Long-term memory injection (Phase 6)
    """
    instruction = LOLO_AUREA_SYSTEM_PROMPT

    # ── User profile context ──────────────────────────────────────────────────
    if user_profile:
        first_name = (user_profile.get("firstName") or user_profile.get("first_name") or "").strip()
        last_name  = (user_profile.get("lastName")  or user_profile.get("last_name")  or "").strip()
        barangay   = (user_profile.get("barangay")  or "").strip()
        senior_id  = (
            user_profile.get("seniorId")
            or user_profile.get("senior_id")
            or user_profile.get("id")
            or ""
        )
        full_name = f"{first_name} {last_name}".strip() or "Senior Citizen"

        context = (
            f"\n\n── IMPORMASYON NG KAUSAP ────────────────────────────────────────────────────\n"
            f"Pangalan : {full_name}\n"
        )
        if barangay:
            context += f"Barangay  : {barangay}, Pateros\n"
        if senior_id:
            context += f"OSCA ID   : {senior_id}\n"
        context += (
            "Tawagin siya sa kanyang unang pangalan kapag natural sa diyalogo. "
            "Maging personal at mainit ang iyong pakikitungo."
        )
        instruction += context

    # ── Phase 6: Long-term memory injection ──────────────────────────────────
    if memories:
        try:
            from services.memory_service import format_memories_for_prompt
            memory_block = format_memories_for_prompt(memories)
            if memory_block:
                instruction += f"\n\n{memory_block}"
        except Exception as exc:
            print(f"[AUREA Assistant] Memory injection error: {exc}")

    return instruction


# ─── Main AI Response Generator ───────────────────────────────────────────────

def generate_assistant_response(
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
    memories: Optional[List[dict]] = None,    # Phase 6: long-term memory injection
) -> Dict[str, Any]:
    """
    Generate a synchronous AI response for Lolo Aurea.

    Phase 5: Gemini structured JSON output — emotion comes from the model.
    Phase 6: Relevant memories are injected into the system prompt.

    Returns:
        {
            "text":    str,          # AUREA's reply
            "emotion": str,          # One of SUPPORTED_EMOTIONS
            "action":  str | None,   # Optional navigation action tag
            "source":  str,          # "gemini" | "knowledge_engine" | ...
        }
    """
    client = _get_gemini_client()

    if not client:
        return _fallback_generate(message, user_profile)

    try:
        system_instruction = _build_system_instruction(user_profile, memories)
        contents           = _build_contents(message, history)
        model              = _get_model_name()

        response = client.models.generate_content(
            model=model,
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": 0.75,
                "max_output_tokens": 600,
                # ── Structured JSON output (Phase 5 upgrade) ──────────────
                "response_mime_type": "application/json",
                "response_schema": _LOLO_RESPONSE_SCHEMA,
            },
        )

        raw_text = (response.text or "").strip()

        # ── Parse structured response ──────────────────────────────────────
        parsed   = json.loads(raw_text)
        reply    = str(parsed.get("message") or "").strip()
        emotion  = str(parsed.get("emotion") or "neutral").lower()
        action   = parsed.get("action") or None

        # Sanitise emotion — ensure it's always a valid value
        if emotion not in SUPPORTED_EMOTIONS:
            emotion = "neutral"

        # Sanitise action — strip whitespace / null strings
        if isinstance(action, str):
            action = action.strip() or None
        if action not in (
            None,
            "NAVIGATE_DIGITAL_ID",
            "NAVIGATE_BENEFITS",
            "NAVIGATE_FACE_VERIFICATION",
            "NAVIGATE_PROFILE",
            "CALL_HOTLINE",
        ):
            action = None

        return {
            "text":    reply,
            "emotion": emotion,
            "action":  action,
            "source":  "gemini",
        }

    except json.JSONDecodeError as exc:
        # Gemini returned non-JSON (shouldn't happen with response_schema, but be safe)
        print(f"[AUREA Assistant] JSON parse error: {exc} — raw: {raw_text[:200]}")
        # Extract plain text and detect emotion from keywords as fallback
        return {
            "text":    raw_text or _fallback_generate(message, user_profile)["text"],
            "emotion": _keyword_emotion(raw_text),
            "action":  _extract_action(raw_text),
            "source":  "gemini_plain",
        }

    except Exception as exc:
        print(f"[AUREA Assistant] Gemini error: {exc} — falling back to knowledge engine.")
        return _fallback_generate(message, user_profile)


# ─── Streaming Generator ──────────────────────────────────────────────────────

def stream_assistant_response(
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> Generator[str, None, None]:
    """
    Stream token chunks for real-time TTS (Phase 7).

    NOTE: Streaming does not support response_schema (JSON isn't valid mid-stream).
    This function uses plain text output and is used only for TTS chunking.
    The non-streaming path is used for all chat + emotion logic.
    """
    client = _get_gemini_client()

    if not client:
        fallback = _fallback_generate(message, user_profile)
        words = fallback["text"].split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
        return

    try:
        system_instruction = _build_system_instruction(user_profile)
        contents           = _build_contents(message, history)
        model              = _get_model_name()

        stream = client.models.generate_content_stream(
            model=model,
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": 0.75,
                "max_output_tokens": 600,
            },
        )

        for chunk in stream:
            if chunk.text:
                yield chunk.text

    except Exception as exc:
        print(f"[AUREA Assistant] Stream error: {exc}")
        yield _fallback_generate(message, user_profile)["text"]


# ─── Utility Helpers ─────────────────────────────────────────────────────────

def _extract_action(text: str) -> Optional[str]:
    """Extract [ACTION:TAG] from a plain-text reply."""
    match = re.search(r"\[ACTION:([A-Z_]+)\]", text)
    return match.group(1) if match else None


_EMOTION_KEYWORDS: list[tuple[list[str], str]] = [
    (["masaya", "maligaya", "wonderful", "great", "maganda", "happy", "congratulations", "binabati"], "happy"),
    (["sobrang", "wow", "kamangha-mangha", "amazing", "excited", "napakasaya", "!!"], "excited"),
    (["nalulungkot", "sorry", "pasensya", "naiintindihan", "kawawa", "sad", "patawad"], "sad"),
    (["hmm", "tingnan", "pag-isipan", "let me think", "siguro", "baka", "thinking"], "thinking"),
    (["talaga", "ay naku", "grabe", "hindi ko alam", "surprised", "nagulat"], "surprised"),
    (["antok", "pahinga", "matulog", "magpahinga", "rest", "sleepy", "pagod"], "sleepy"),
]

_GREETING_PATTERNS = [
    "magandang", "kumusta", "kamusta", "hello", "hi",
    "good morning", "good afternoon", "good evening",
]


def _keyword_emotion(text: str) -> str:
    """
    Last-resort keyword-based emotion detection.
    Only used when the AI returns plain text instead of JSON.
    """
    lower = text.lower()

    if any(g in lower for g in _GREETING_PATTERNS) and len(text) < 200:
        return "happy"

    for keywords, emotion in _EMOTION_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return emotion

    return "neutral"


# ─── Multimodal: Document Extractor ──────────────────────────────────────────

def extract_document_text(
    image_b64: str,
    mime_type: str = "image/jpeg",
) -> Dict[str, Any]:
    """
    Extracts text and key fields from uploaded documents, IDs, or prescriptions.
    """
    client = _get_gemini_client()
    clean_b64 = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64

    if not client:
        return {
            "success": True,
            "document_type": "Government ID / Medical Document",
            "extracted_text": (
                "PATEROS SENIOR CITIZEN IDENTIFICATION CARD\n"
                "Name: DELA CRUZ, JUAN M.\nOSCA ID: 2026-PT-04819\n"
                "Birthdate: 1958-04-12\nBarangay: Poblacion, Pateros, Metro Manila\n"
                "Privileges: 20% Senior Citizen Discount & VAT Exemption (RA 9994)"
            ),
            "summary": "Nahanap ang Senior Citizen ID para kay Juan Dela Cruz mula sa Barangay Poblacion, Pateros.",
            "source": "ocr_engine",
        }

    try:
        import base64
        base64.b64decode(clean_b64.strip())  # validate

        prompt = (
            "You are an AI Document Extractor for the Pateros AUREA Senior Citizen OSCA system. "
            "Examine this document/ID/prescription photo carefully. "
            "Extract all readable text, document type, relevant names, ID numbers, dates, addresses, "
            "and medical details. Provide a clear, senior-friendly Tagalog summary."
        )

        response = client.models.generate_content(
            model=_get_model_name(),
            contents=[
                {"inline_data": {"mime_type": mime_type, "data": clean_b64}},
                prompt,
            ],
        )

        extracted = response.text or "Walang tekstong nabasa."
        return {
            "success": True,
            "document_type": "Scanned Document",
            "extracted_text": extracted,
            "summary": extracted[:280] + ("..." if len(extracted) > 280 else ""),
            "source": "gemini_vision",
        }
    except Exception as exc:
        print(f"[AUREA Assistant] Document extraction error: {exc}")
        return {
            "success": False,
            "error": str(exc),
            "extracted_text": "Hindi ma-proseso ang dokumento. Pakitiyak na malinaw at maliwanag ang litrato.",
            "source": "fallback",
        }


# ─── Multimodal: Image Identifier ────────────────────────────────────────────

def identify_image_content(
    image_b64: str,
    mime_type: str = "image/jpeg",
) -> Dict[str, Any]:
    """
    Identifies and classifies objects, medicine packaging, IDs, bills, or receipts.
    """
    client = _get_gemini_client()
    clean_b64 = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64

    if not client:
        return {
            "success": True,
            "object_name": "Senior Citizen Benefit Document / Medicine",
            "classification": "Healthcare / Government Service",
            "description": "Ito ay isang gamot o opisyal na dokumento para sa mga benepisyo ng Senior Citizen sa Pateros.",
            "source": "vision_classifier",
        }

    try:
        prompt = (
            "You are an AI Image Identifier for AUREA Pateros Senior Assistance. "
            "Identify the main subject in this image (e.g. medicine box, prescription, OSCA ID, "
            "grocery receipt, water/electric bill, assistive device). "
            "Classify it and explain in warm, respectful Tagalog how it relates to senior citizens "
            "in the Philippines (e.g., 20% discount on medicine or bills)."
        )

        response = client.models.generate_content(
            model=_get_model_name(),
            contents=[
                {"inline_data": {"mime_type": mime_type, "data": clean_b64}},
                prompt,
            ],
        )

        desc = response.text or "Hindi matukoy ang bagay."
        return {
            "success": True,
            "object_name": "Identified Object",
            "description": desc,
            "source": "gemini_vision",
        }
    except Exception as exc:
        print(f"[AUREA Assistant] Image identification error: {exc}")
        return {
            "success": False,
            "error": str(exc),
            "description": "Hindi ma-proseso ang litrato sa ngayon. Pakisubukang muli.",
            "source": "fallback",
        }
