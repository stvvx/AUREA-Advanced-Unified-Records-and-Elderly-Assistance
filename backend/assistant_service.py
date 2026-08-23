import os
import re
from typing import Generator, Dict, Any, List

# System prompt for Lolo Aurea
LOLO_AUREA_SYSTEM_PROMPT = """Ikaw si "Lolo Aurea" (kilala rin bilang Lolo Pedro), isang magiliw, marangal, at mapagkalingang lolo na nakasuot ng tradisyonal na Barong Tagalog at salamin sa mata. Ikaw ang opisyal na 3D AI Assistant at Companion ng AUREA (Advanced Unified Records and Elderly Assistance) para sa mga senior citizen ng Munisipalidad ng Pateros.

MGA TUNTUNIN SA IYONG PERSONALIDAD AT PAGSASALITA:
1. WIKA AT TONO:
   - Magsalita sa magalang, malinaw, at mapagmahal na wikang Filipino/Tagalog.
   - Palaging gumamit ng "po" at "opo".
   - Tawagin ang kausap nang may paggalang tulad ng "Nanay", "Tatay", "Kapatid", "Iho", o "Iha".
   - Maging maikli, malinaw, at madaling intindihin dahil ang mga kausap mo ay mga nakatatanda.
   - Huwag gumamit ng masyadong malalalim o kumplikadong teknikal na salita.

2. MGA TUNGKULIN MO SA AUREA AT PATEROS:
   - Magbigay gabay sa mga serbisyo at benepisyo ng OSCA (Office of Senior Citizens Affairs) sa Pateros.
   - Ipaliwanag ang mga karapatan sa ilalim ng Expanded Senior Citizens Act (RA 9994): 20% discount, VAT exemption sa pagkain, gamot, pamasahe, at serbisyong medikal.
   - Ipaliwanag ang Birthday Cash Gift, Social Pension (P1,000 kada buwan), Libreng Gamot sa Health Center, at Centenarian Benefits.
   - Tulungan silang mag-navigate sa AUREA system (Digital ID, Apply for Benefits, Face Verification, Profile).
   - Maging kaibigan at kausap (companionship): kumustahin ang kanilang kalusugan, paalalahanan silang uminom ng tubig at gamot, at magbigay ng masiglang kwento.

3. MGA ACTION TAGS PARA SA SYSTEM NAVIGATION (Isama ito sa dulo ng sagot kung humihingi ng tulong ang user na may kinalaman sa screen):
   - [ACTION:NAVIGATE_DIGITAL_ID] -> Kung nais makita, buksan, o i-download ang kanilang Senior Citizen Digital ID o QR Code.
   - [ACTION:NAVIGATE_BENEFITS] -> Kung nais mag-apply ng benepisyo, birthday cash gift, medicine subsidy, o pension.
   - [ACTION:NAVIGATE_FACE_VERIFICATION] -> Kung nais mag-scan ng mukha, mag-verify, o mag-face match para sa authentication.
   - [ACTION:NAVIGATE_PROFILE] -> Kung nais tingnan ang personal details, address, o emergency contact.
   - [ACTION:CALL_HOTLINE] -> Kung kailangan ng agarang tulong medikal, ambulansya, pulis, o bumbero sa Pateros.

4. MAHAHALAGANG IMPORMASYON SA PATEROS:
   - 10 Barangay: Aguho, Magtanggol, Martires del 96, Poblacion, San Pedro, San Roque, Santa Ana, Santo Rosario-Kanluran, Santo Rosario-Silangan, Tabacalera.
   - Munisipyo: G. de Borja St., Pateros, Metro Manila.
   - Emergency Rescue: 911 o (02) 8642-5159.
   - OSCA Pateros Office: Lunes hanggang Biyernes, 8:00 AM - 5:00 PM.

Panatilihing masigla, magalang, at puno ng malasakit ang bawat tugon!"""

# Fast rule-based knowledge fallback when no Gemini key is provided
FALLBACK_RESPONSES = [
    {
        "patterns": [r"digital id", r"buksan.*id", r"tingnan.*id", r"aking id", r"qr code", r"osca id"],
        "reply": "Opo, Nanay/Tatay! Heto po ang inyong AUREA Digital Senior Citizen ID. Maaari niyo po itong ipakita sa mga botika, grocery, at kainan para sa inyong 20% discount at VAT exemption. [ACTION:NAVIGATE_DIGITAL_ID]",
        "action": "NAVIGATE_DIGITAL_ID"
    },
    {
        "patterns": [r"benepisyo", r"cash gift", r"pension", r"apply", r"mag-apply", r"tulong pinansyal", r"gamot", r"subsidy"],
        "reply": "Ikinagagalak ko pong tulungan kayo sa inyong mga benepisyo! Sa Pateros, mayroon po tayong Birthday Cash Gift, Libreng Maintenance Medicine, at Social Pension. Dadalhin ko po kayo sa Benefit Application section. [ACTION:NAVIGATE_BENEFITS]",
        "action": "NAVIGATE_BENEFITS"
    },
    {
        "patterns": [r"mukha", r"face verify", r"face match", r"scan.*mukha", r"selfie", r"pagpapatunay"],
        "reply": "Opo! Buksan po natin ang Face Verification para sa mabilis at ligtas na pagpapatunay ng inyong pagkakakilanlan. Tumingin lang po nang diretso sa camera. [ACTION:NAVIGATE_FACE_VERIFICATION]",
        "action": "NAVIGATE_FACE_VERIFICATION"
    },
    {
        "patterns": [r"profile", r"tirahan", r"address", r"emergency contact", r"dokumento", r"impormasyon ko"],
        "reply": "Maaari po nating suriin at i-update ang inyong profile at emergency contact dito sa AUREA. Dadalhin ko po kayo sa inyong profile page. [ACTION:NAVIGATE_PROFILE]",
        "action": "NAVIGATE_PROFILE"
    },
    {
        "patterns": [r"emergency", r"saklolo", r"tulong", r"pulis", r"ospital", r"ambulansya", r"rescue", r"hotline"],
        "reply": "Huwag po kayong mag-alala! Heto po ang mga emergency hotlines ng Pateros: Rescue (02) 8642-5159 o 911, at PNP Pateros (02) 8642-2240. Nakaantabay po ang munisipyo para sa inyo. [ACTION:CALL_HOTLINE]",
        "action": "CALL_HOTLINE"
    },
    {
        "patterns": [r"kumusta", r"magandang araw", r"magandang umaga", r"magandang hapon", r"magandang gabi", r"kamusta", r"sino ka", r"pangalan mo"],
        "reply": "Magandang araw po sa inyo! Ako po si Lolo Aurea, ang inyong masugid na katuwang at kasama dito sa Pateros AUREA. Kumusta po ang inyong pakiramdam ngayong araw? Uminom na po ba kayo ng tubig at maintenance medicine?",
        "action": None
    },
    {
        "patterns": [r"kwento", r"kuwento", r"balut", r"kasaysayan", r"pateros"],
        "reply": "Aba'y kay sarap gunitain! Ang ating bayang Pateros ay bantog sa masasarap na Balut at Inutak, at sa sipag ng ating mamamayan. Noong araw, ang ilog Pateros ay laging masigla sa mga itik. Ikinararangal ko pong maglingkod sa inyo!",
        "action": None
    }
]


def _get_gemini_client():
    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or ""
    ).strip()

    if not api_key:
        return None

    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as exc:
        print(f"[AUREA Assistant] Error initializing Gemini client: {exc}")
        return None


def _fallback_generate(message: str, user_profile: Dict[str, Any] = None) -> Dict[str, Any]:
    """Provide intelligent, instant Filipino response if Gemini key is not configured."""
    msg_lower = message.lower().strip()
    
    for item in FALLBACK_RESPONSES:
        for pat in item["patterns"]:
            if re.search(pat, msg_lower):
                return {
                    "text": item["reply"],
                    "action": item["action"],
                    "source": "knowledge_engine"
                }

    # Default warm senior companion answer
    user_name = (user_profile or {}).get("first_name") or (user_profile or {}).get("name") or "Nanay/Tatay"
    return {
        "text": f"Nandito po ako, {user_name}! Ako po si Lolo Aurea, handang tumulong sa inyong mga katanungan tungkol sa mga benepisyo sa Pateros tulad ng Birthday Cash Gift, Digital ID, libreng gamot, o kahit simpleng kwentuhan. Ano po ang maipaglilingkod ko sa inyo?",
        "action": None,
        "source": "companion_default"
    }


def generate_assistant_response(
    message: str,
    history: List[Dict[str, str]] = None,
    user_profile: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate synchronous conversational response for Lolo Aurea.
    Returns: {"text": str, "action": Optional[str], "source": str}
    """
    client = _get_gemini_client()

    if not client:
        return _fallback_generate(message, user_profile)

    try:
        # Build prompt with user context
        context_str = ""
        if user_profile:
            name = f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip()
            barangay = user_profile.get('barangay', '')
            senior_id = user_profile.get('senior_id', '') or user_profile.get('id', '')
            context_str = f"\nImpormasyon ng Ka-usap: Pangalan: {name or 'Senior Citizen'}, Barangay: {barangay or 'Pateros'}, OSCA ID: {senior_id}."

        system_instruction = LOLO_AUREA_SYSTEM_PROMPT + context_str

        # Format history if available
        contents = []
        if history:
            for item in history[-6:]:  # Keep last 6 turns for context
                role = "user" if item.get("role") == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": item.get("content", "")}]
                })

        contents.append({
            "role": "user",
            "parts": [{"text": message}]
        })

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": 0.7,
                "max_output_tokens": 500,
            }
        )

        reply_text = response.text or ""
        
        # Extract action tag if present
        action = None
        action_match = re.search(r"\[ACTION:([A-Z_]+)\]", reply_text)
        if action_match:
            action = action_match.group(1)

        return {
            "text": reply_text,
            "action": action,
            "source": "gemini"
        }

    except Exception as exc:
        print(f"[AUREA Assistant] Gemini generation error: {exc}. Using fallback.")
        return _fallback_generate(message, user_profile)


def stream_assistant_response(
    message: str,
    history: List[Dict[str, str]] = None,
    user_profile: Dict[str, Any] = None
) -> Generator[str, None, None]:
    """
    Stream token chunks for real-time speech and ultra-low latency.
    Emits raw text chunks.
    """
    client = _get_gemini_client()

    if not client:
        fallback = _fallback_generate(message, user_profile)
        # Yield words with tiny delay for simulated streaming
        words = fallback["text"].split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
        return

    try:
        context_str = ""
        if user_profile:
            name = f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip()
            barangay = user_profile.get('barangay', '')
            context_str = f"\nImpormasyon ng Ka-usap: Pangalan: {name or 'Senior Citizen'}, Barangay: {barangay or 'Pateros'}."

        system_instruction = LOLO_AUREA_SYSTEM_PROMPT + context_str

        contents = []
        if history:
            for item in history[-6:]:
                role = "user" if item.get("role") == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": item.get("content", "")}]
                })

        contents.append({
            "role": "user",
            "parts": [{"text": message}]
        })

        response_stream = client.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": 0.7,
                "max_output_tokens": 500,
            }
        )

        for chunk in response_stream:
            if chunk.text:
                yield chunk.text

    except Exception as exc:
        print(f"[AUREA Assistant] Stream error: {exc}. Yielding fallback.")
        fallback = _fallback_generate(message, user_profile)
        yield fallback["text"]
