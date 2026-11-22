"""Send account and service notifications through the configured SMTP relay."""

import logging
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.errors import MessageError
from email.utils import make_msgid
from html import escape
from pathlib import Path

import requests

from config import Config

ACTIVITY_LABELS = {
    "octogenarian_benefit_applications": "birthday benefit application",
    "birthday_benefit_applications": "birthday benefit application",
    "physical_id_applications": "physical ID application",
    "philhealth_applications": "PhilHealth application",
    "social_pension_applications": "social pension application",
    "purchase_booklet_applications": "purchase booklet application",
    "osca_transfer_applications": "OSCA transfer application",
    "financial_assistance_applications": "financial assistance application",
    "checkup_appointments": "checkup appointment",
    "emergency_reports": "emergency report",
    "movie_reservations": "movie reservation",
    "service_feedback": "service feedback",
    "issue_reports": "issue report",
    "community_posts": "community post",
    "community_comments": "community comment",
    "community_post_likes": "community reaction",
}
ACTIVITY_ACTIONS = {"POST": "Natanggap na", "PATCH": "Na-update na", "DELETE": "Na-remove na"}
STATUS_LABELS = {
    "Pending": "Naghihintay ng review", "Under Review": "Nire-review na",
    "Eligible": "Qualified", "Ineligible": "Hindi qualified", "Approved": "Approved na",
    "Rejected": "Hindi na-approve", "For Processing": "Para sa processing",
    "Released": "Na-release na", "Cancelled": "Na-cancel na", "Confirmed": "Confirmed na",
    "Returned": "Ibinalik para sa correction", "Endorsed": "Na-endorse na",
    "Ready for pickup": "Ready for pickup", "Completed": "Completed na",
    "Submitted": "Na-submit na", "Acknowledged": "Natanggap na ng staff", "Closed": "Closed na",
    "open": "Open", "in_progress": "Inaaksyunan na", "resolved": "Resolved na", "closed": "Closed na",
    "published": "Published", "hidden": "Naka-hide",
}
STATUS_FIELDS = {"validation_status": "Verification status", "benefit_status": "Benefit status", "status": "Status"}
DETAIL_FIELDS = {
    "benefit_amount": "Halaga ng benefit", "date_validated": "Petsa ng verification",
    "date_released": "Petsa ng release", "scheduled_at": "Schedule",
}
NOTE_FIELDS = {"review_note", "findings_concerns_recommendations", "admin_note", "resolution_note"}
PROFILE_CHECKLIST = (
    "Kumpletuhin ang profile mo sa AUREA: buong pangalan, petsa ng kapanganakan, address at contact number.",
    "Para sa bagong Physical Senior Citizen ID, ihanda ang valid Philippine government-issued ID, PSA birth certificate, Barangay Certificate of Residency at recent ID photo. Maglagay din ng pirma sa Digital ID.",
    "Kung ibang serbisyo ang kailangan mo, buksan ang application form sa AUREA para makita ang checklist nito at doon mag-upload.",
)
REPRESENTATIVE_DOCUMENTS = "Kung immediate relative ang magsusumite para sa iyo, ihanda ang signed authorization at valid Philippine government-issued ID niya."
BIRTHDAY_REQUIREMENTS = (
    "I-check ang eligibility gamit ang birthday na naka-save sa profile mo sa AUREA.",
    "Ilagay ang permanent address, contact number at email address. Mag-upload ng full-body photo.",
)
SERVICE_REQUIREMENTS = {
    "octogenarian_benefit_applications": BIRTHDAY_REQUIREMENTS,
    "birthday_benefit_applications": BIRTHDAY_REQUIREMENTS,
    "philhealth_applications": (
        "Kumpletuhin at pirmahan ang PhilHealth Member Registration Form (PMRF).",
        "Ihanda ang Senior Citizen ID at valid Philippine government-issued ID.",
        REPRESENTATIVE_DOCUMENTS,
    ),
    "social_pension_applications": (
        "Kumpletuhin at pirmahan ang DSWD Social Pension intake form.",
        "Ihanda ang Barangay Certificate of Indigency at recent 1×1 ID photo.",
        "Kung kailangan pang mag-upload ng Senior Citizen ID, gumamit ng kopyang may tatlong specimen signatures o right thumbmark.",
    ),
    "purchase_booklet_applications": ("Ihanda ang Senior Citizen ID.", REPRESENTATIVE_DOCUMENTS),
    "osca_transfer_applications": (
        "Ihanda ang Senior Citizen ID at Barangay Certificate mula sa bagong barangay.",
        "Ilagay ang kumpletong bagong address, kasama ang barangay at lungsod o munisipalidad.",
        REPRESENTATIVE_DOCUMENTS,
    ),
    "checkup_appointments": (
        "Pumili ng health center at available na petsa at oras sa AUREA.",
        "Ilagay ang pangalan, kasarian, address, contact number, emergency contact at relasyon sa kanya, at dahilan ng check-up.",
    ),
    "emergency_reports": ("Ilagay ang uri ng emergency, eksaktong lokasyon, contact number at detalye ng nangyari.",),
    "movie_reservations": ("Pumili ng screening at available na seats sa AUREA.",),
}
ASSET_DIR = Path(__file__).resolve().parents[1] / "assets" / "email"
logger = logging.getLogger(__name__)


def service_requirements(table, request_type):
    if table == "physical_id_applications":
        common = ("Ihanda ang valid Philippine government-issued ID at recent ID photo. Maglagay ng pirma sa Digital ID.",)
        extra = {
            "new": ("Para sa bagong ID, ihanda ang PSA birth certificate at Barangay Certificate of Residency.",),
            "lost": ("Para sa nawalang ID, ihanda ang Affidavit of Loss.",),
        }
        return (*common, *extra.get(request_type, ()), REPRESENTATIVE_DOCUMENTS)
    if table == "financial_assistance_applications":
        common = ("Ihanda ang Barangay Indigency Clearance at valid ID ng claimant.",)
        if request_type == "burial":
            return (*common, "Ilagay ang buong pangalan ng yumao. Ihanda ang valid ID niya at Death Certificate na nakarehistro sa Local Civil Registry.")
        if request_type == "medical":
            return (*common, "Ihanda ang recent prescription o medical/clinical abstract at Voter’s ID o Certificate ng claimant at patient na nagpapakita ng Pateros residency.")
        return common
    return SERVICE_REQUIREMENTS.get(table, ())


def set_branded_content(message, subject, body, requirements):
    checklist_title = "Mga kailangang ihanda sa pag-submit"
    plain = f"{body}\n"
    checklist = ""
    if requirements:
        plain += f"\n{checklist_title}\n" + "\n".join(f"• {item}" for item in requirements) + "\n"
        items = "".join(f'<li style="margin:0 0 10px">{escape(item)}</li>' for item in requirements)
        checklist = f"""
          <div style="background:#fff7e2;border-left:4px solid #b47722;padding:16px;margin-top:24px;color:#342516">
            <h2 style="font-size:18px;margin:0 0 10px">{checklist_title}</h2>
            <ul style="margin:0;padding-left:22px">{items}</ul>
          </div>"""

    paragraphs = "".join(f'<p style="margin:0 0 8px">{escape(line)}</p>' for line in body.splitlines() if line)
    pateros_id, aurea_id = (make_msgid(domain="aurea.local") for _ in range(2))
    message.set_content(plain + "\n— AUREA | Municipality of Pateros\n")
    message.add_alternative(f"""<!doctype html>
<html lang="fil"><body style="margin:0;background:#f4f1e9;font-family:Arial,sans-serif;color:#24362d">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1e9">
  <tr><td align="center" style="padding:16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#fff">
      <tr><td align="center" style="border-top:5px solid #b47722;background:#fff5dc;padding:16px">
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding:0 12px"><img src="cid:{pateros_id[1:-1]}" width="64" alt="Municipality of Pateros" style="display:block;height:auto"></td>
            <td style="padding:0 12px"><img src="cid:{aurea_id[1:-1]}" width="96" alt="AUREA" style="display:block;height:auto"></td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px;background:#174535;color:#fff">
        <h1 style="margin:0;font-size:25px;line-height:1.25">{escape(subject)}</h1>
      </td></tr>
      <tr><td style="padding:22px;font-size:16px;line-height:1.55;color:#24362d">
        {paragraphs}{checklist}
      </td></tr>
      <tr><td style="padding:14px 22px;background:#eaf0e9;color:#24362d;font-size:14px">
        AUREA · Municipality of Pateros
      </td></tr>
    </table>
  </td></tr>
</table></body></html>""", subtype="html")
    html_part = message.get_payload()[-1]
    for filename, content_id in (("pateros.png", pateros_id), ("aurea.png", aurea_id)):
        html_part.add_related((ASSET_DIR / filename).read_bytes(), maintype="image", subtype="png",
                              cid=content_id, disposition="inline")


def notify_user(user_id, subject, body, *, email=None, requirements=()):
    host = os.getenv("SMTP_HOST", "").strip()
    if not host or not user_id:
        return

    try:
        if email is None:
            response = requests.get(
                f"{Config.SUPABASE_URL}/rest/v1/{Config.SUPABASE_USERS_TABLE}",
                headers=Config.supabase_headers(),
                params={"id": f"eq.{user_id}", "select": "email", "limit": 1},
                timeout=(3, 5),
            )
            response.raise_for_status()
            rows = response.json()
            email = rows[0].get("email") if rows else None
        if not email:
            return

        message = EmailMessage()
        message["From"] = os.getenv("SMTP_FROM", "").strip()
        message["To"] = email
        message["Subject"] = subject
        set_branded_content(message, subject, body, requirements)
        recipient = message["To"]
        sender = message["From"]
        for address in (recipient, sender):
            if address.defects or len(address.addresses) != 1 or not address.addresses[0].domain:
                raise ValueError("SMTP requires one valid sender and recipient.")

        security = os.getenv("SMTP_SECURITY", "starttls").strip().lower()
        if security not in {"starttls", "ssl"}:
            raise ValueError("SMTP_SECURITY must be starttls or ssl.")
        port = int(os.getenv("SMTP_PORT", "465" if security == "ssl" else "587"))
        username = os.getenv("SMTP_USERNAME", "")
        password = os.getenv("SMTP_PASSWORD", "")
        context = ssl.create_default_context()
        if security == "ssl":
            connection = smtplib.SMTP_SSL(host, port, timeout=5, context=context)
        else:
            connection = smtplib.SMTP(host, port, timeout=5)
        try:
            if security == "starttls":
                connection.starttls(context=context)
            if username:
                connection.login(username, password)
            connection.send_message(message, to_addrs=[recipient.addresses[0].addr_spec])
        finally:
            connection.close()
    except (OSError, ValueError, MessageError) as error:
        logger.warning("Could not send email notification (%s)", type(error).__name__)


def notify_profile(user_id, *, email=None):
    notify_user(user_id, "Na-update ang AUREA profile mo",
                "Na-save na ang changes sa profile mo. Buksan ang AUREA para i-check ang details.", email=email)


def transaction_update(row, changes, previous):
    fields = {key for key in changes if key in row and (previous is None or row[key] != previous.get(key))}
    details = []
    headlines = []
    for key, label in STATUS_FIELDS.items():
        if key not in fields or row[key] not in STATUS_LABELS:
            continue
        status = STATUS_LABELS[row[key]]
        old_status = STATUS_LABELS.get(previous.get(key)) if previous is not None else None
        headlines.append(status)
        details.append(f"{label}: {old_status} → {status}" if old_status else f"{label}: {status}")
    for key, label in DETAIL_FIELDS.items():
        show_amount = key == "benefit_amount" and "benefit_status" in fields and row.get("benefit_status") in {"Approved", "Released"}
        if key not in fields and not (show_amount and row.get(key) is not None):
            continue
        value = row[key]
        try:
            if key == "benefit_amount" and value is not None:
                value = f"₱{float(value):,.2f}"
            elif key == "scheduled_at" and isinstance(value, str):
                value = datetime.fromisoformat(value).astimezone(timezone(timedelta(hours=8))).strftime("%d %b %Y, %I:%M %p (Manila)")
        except (ValueError, TypeError, OverflowError):
            continue
        details.append(f"{label}: {value if value is not None else 'Inalis'}")
    if fields & NOTE_FIELDS:
        details.append("May update sa review notes. Makikita ang note sa AUREA.")
    return headlines, details


def notify_activity(method, table, rows, *, owner_id=None, changes=None, previous=None):
    label = ACTIVITY_LABELS.get(table)
    action = ACTIVITY_ACTIONS.get(method)
    if not label or not action or not os.getenv("SMTP_HOST", "").strip():
        return
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        return
    for row in rows:
        subject = f"{action} ang {label} mo"
        lines = [f"{subject}."]
        if method == "PATCH" and changes:
            headlines, details = transaction_update(row, changes, previous)
            if table in {"community_posts", "community_comments"} and "body" in changes:
                details.append("Na-edit ang text. Makikita ang bagong version sa AUREA.")
            if previous is not None and not details:
                continue
            if headlines:
                subject = f"{label.capitalize()}: {' / '.join(dict.fromkeys(headlines))}"
            if details:
                lines = [f"May update sa {label} mo.", *details]
        if row.get("id") and method != "DELETE":
            lines.append(f"Reference: {row['id']}")
        lines.append("Buksan ang AUREA para makita ang buong details.")
        notify_user(row.get("user_id") or owner_id, subject, "\n".join(lines),
                    requirements=service_requirements(table, row.get("request_type")) if method != "DELETE" else ())
