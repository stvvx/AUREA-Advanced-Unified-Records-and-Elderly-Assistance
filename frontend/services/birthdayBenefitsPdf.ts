import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { BAGONG_PILIPINAS_LOGO_BASE64, NCSC_LOGO_BASE64 } from '../assets/pdfLogos';

export type BirthdayBenefitApplicationPdfData = {
  id?: string;
  user_id?: number;
  ncsc_registration_reference_number?: string;
  osca_id_number?: string;
  benefit_type?: 'Octogenarian' | 'Nonagenarian' | 'Centenarian' | string;
  date_of_birth?: string;
  date_of_application?: string;
  residential_address?: string;
  permanent_address_philippines?: string;
  spouse_name?: string;
  spouse_citizenship?: string;
  representative_name?: string;
  representative_relationship?: string;
  contact_number?: string;
  email_address?: string;
  citizenship?: string;
  is_dual_citizen?: boolean;
  dual_citizenship_details?: string;
  applicant_signature?: string;
  applicant_signature_date?: string;

  // Documentary requirements
  birth_certificate_submitted?: boolean;
  birth_certificate_url?: string | null;
  valid_id_submitted?: boolean;
  valid_id_url?: string | null;
  id_picture_submitted?: boolean;
  id_picture_url?: string | null;
  full_body_picture_submitted?: boolean;
  full_body_picture_url?: string | null;
  endorsed_list_submitted?: boolean;
  endorsed_list_url?: string | null;

  // OSCA review
  validation_status?: string;
  benefit_status?: string;
  benefit_amount?: number | null;
  date_released?: string | null;
  findings_concerns_recommendations?: string | null;
  validated_by?: number | null;
  validated_by_name?: string | null;
  date_validated?: string | null;
  created_at?: string;

  // Applicant details
  applicant?: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    contact?: string;
    gender?: string;
    civilStatus?: string;
    address?: string;
    children?: Array<{ id?: string; name: string; dob?: string }>;
    avatarUrl?: string;
    oscaIdNumber?: string;
    digitalSignature?: string | null;
    signature?: string | null;
  };
};

function escapeHtml(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderApplicantSignature(value?: string | null): string {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed?.strokes) && parsed.strokes.length) {
      const width = Number(parsed.width) || 320;
      const height = Number(parsed.height) || 140;
      if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return '';
      const paths = parsed.strokes.filter((stroke: any) => typeof stroke.d === 'string')
        .map((stroke: any) => `<path d="${escapeHtml(stroke.d)}" stroke="${escapeHtml(stroke.color || '#132018')}" stroke-width="${Math.max(1, Math.min(Number(stroke.width) || 2.4, 20))}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`).join('');
      return `<div class="applicant-signature"><svg xmlns="http://www.w3.org/2000/svg" width="220" height="52" viewBox="0 0 ${width} ${height}" role="img" aria-label="Applicant digital signature">${paths}</svg></div>`;
    }
  } catch { /* An image signature is handled below. Typed names are not drawn signatures. */ }
  if (/^(?:https?:\/\/|data:image\/)/i.test(value)) {
    return `<div class="applicant-signature"><img src="${escapeHtml(value)}" alt="Applicant digital signature" /></div>`;
  }
  return '';
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).toUpperCase();
    }
  }
  return trimmed.toUpperCase();
}

function parsePhilippineAddress(raw?: string | null) {
  const address = parseAddressParts(raw);
  if (/^pateros(?:\s+city)?$/i.test(address.city.trim())) {
    const barangay = address.barangay.replace(/^(?:brgy\.?|barangay|bgy\.?)\s+/i, '').trim();
    return {
      ...address,
      province: 'Metro Manila',
      // Santa Ana has its own postal code; the general Pateros code is 1620.
      zipCode: /^(?:santa|sta\.?)\s+ana$/i.test(barangay) ? '1621' : '1620',
    };
  }
  return address;
}

function parseAddressParts(raw?: string | null) {
  if (!raw || !raw.trim() || /^(?:n\s*\/?\s*a|not applicable|null|undefined)$/i.test(raw.trim())) {
    return {
      houseNumber: 'N/A',
      street: 'N/A',
      barangay: 'N/A',
      city: 'N/A',
      province: 'N/A',
      zipCode: 'N/A',
    };
  }

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);

  // A subdivision is part of the street, not a separate barangay column.
  // Use an explicit barangay label as the boundary instead of counting commas.
  const barangayIndex = parts.findIndex((part) => /^(?:brgy\.?|barangay|bgy\.?)\s+/i.test(part));
  if (barangayIndex >= 0) {
    const beforeBarangay = parts.slice(0, barangayIndex);
    const hasHouseNumber = /^(?:#?\d|block\b|blk\.?\s|lot\b)/i.test(beforeBarangay[0] || '');
    const houseNumber = hasHouseNumber ? beforeBarangay.shift()! : 'N/A';
    const afterBarangay = parts.slice(barangayIndex + 1);
    let zipCode = 'N/A';
    const lastPart = afterBarangay[afterBarangay.length - 1];
    const zipMatch = lastPart?.match(/(?:^|\s)(\d{4})$/);
    if (zipMatch) {
      zipCode = zipMatch[1];
      const remainder = lastPart.slice(0, zipMatch.index).trim();
      if (remainder) afterBarangay[afterBarangay.length - 1] = remainder;
      else afterBarangay.pop();
    }
    return {
      houseNumber,
      street: beforeBarangay.join(', ') || 'N/A',
      barangay: parts[barangayIndex],
      city: afterBarangay[0] || 'N/A',
      province: afterBarangay.slice(1).join(', ') || 'N/A',
      zipCode,
    };
  }

  // Also accept an unlabelled barangay when an explicit subdivision precedes it.
  const subdivisionIndex = parts.findIndex((part, index) => index > 0 && /\b(?:homes|subdivision|subd\.?|village)\b/i.test(part));
  if (subdivisionIndex >= 0 && parts.length > subdivisionIndex + 2) {
    const hasHouseNumber = /^(?:#?\d|block\b|blk\.?\s|lot\b)/i.test(parts[0]);
    const streetStart = hasHouseNumber ? 1 : 0;
    const tail = parts.slice(subdivisionIndex + 2);
    const zipCode = /^\d{4}$/.test(tail[tail.length - 1] || '') ? tail.pop()! : 'N/A';
    return {
      houseNumber: hasHouseNumber ? parts[0] : 'N/A',
      street: parts.slice(streetStart, subdivisionIndex + 1).join(', '),
      barangay: parts[subdivisionIndex + 1],
      city: tail[0] || 'N/A',
      province: tail.slice(1).join(', ') || 'N/A',
      zipCode,
    };
  }

  if (parts.length >= 6) {
    return {
      houseNumber: parts[0] || 'N/A',
      street: parts[1] || 'N/A',
      barangay: parts[2] || 'N/A',
      city: parts[3] || 'N/A',
      province: parts[4] || 'N/A',
      zipCode: parts[5] || 'N/A',
    };
  }

  if (parts.length === 5) {
    const lastPart = parts[4];
    const isZip = /^\d{4}$/.test(lastPart);
    return {
      houseNumber: parts[0] || 'N/A',
      street: parts[1] || 'N/A',
      barangay: parts[2] || 'N/A',
      city: parts[3] || 'N/A',
      province: isZip ? 'N/A' : lastPart,
      zipCode: isZip ? lastPart : 'N/A',
    };
  }

  if (parts.length === 4) {
    return {
      houseNumber: '',
      street: parts[0] || 'N/A',
      barangay: parts[1] || 'N/A',
      city: parts[2] || 'N/A',
      province: parts[3] || 'N/A',
      zipCode: 'N/A',
    };
  }

  if (parts.length === 3) {
    return {
      houseNumber: '',
      street: parts[0] || 'N/A',
      barangay: parts[1] || 'N/A',
      city: parts[2] || 'N/A',
      province: 'N/A',
      zipCode: 'N/A',
    };
  }

  if (parts.length === 2) {
    return {
      houseNumber: '',
      street: parts[0] || 'N/A',
      barangay: parts[1] || 'N/A',
      city: 'N/A',
      province: 'N/A',
      zipCode: 'N/A',
    };
  }

  return {
    houseNumber: '',
    street: raw.trim(),
    barangay: 'N/A',
    city: 'N/A',
    province: 'N/A',
    zipCode: 'N/A',
  };
}

function getNcscLogoMarkup(): string {
  if (NCSC_LOGO_BASE64) {
    return `<img src="${NCSC_LOGO_BASE64}" alt="" width="76" height="76" />`;
  }

  return `<svg width="76" height="76" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="48" fill="#1B365D" stroke="#0B1B30" stroke-width="2"/>
  <circle cx="50" cy="50" r="42" fill="#FFFFFF" stroke="#1B365D" stroke-width="1.5"/>
  <circle cx="50" cy="50" r="39" fill="#F8FAFC"/>

  <path id="ncscTextPathTop" d="M 17 50 A 33 33 0 0 1 83 50" fill="none" />
  <path id="ncscTextPathBottom" d="M 82 50 A 32 32 0 0 1 18 50" fill="none" />

  <text font-family="Arial, Helvetica, sans-serif" font-size="5" font-weight="900" fill="#1B365D" letter-spacing="0.3">
    <textPath href="#ncscTextPathTop" startOffset="50%" text-anchor="middle">
      NATIONAL COMMISSION OF SENIOR CITIZENS
    </textPath>
  </text>
  <text font-family="Arial, Helvetica, sans-serif" font-size="4.8" font-weight="800" fill="#1B365D" letter-spacing="0.3">
    <textPath href="#ncscTextPathBottom" startOffset="50%" text-anchor="middle">
      OFFICE OF THE PRESIDENT
    </textPath>
  </text>

  <polygon points="14,50 15.5,51 15,52.8 13.5,51.8 12,52.8 12.5,51 11,50 12.8,50 13.5,48.2 14.2,50" fill="#C4892E"/>
  <polygon points="86,50 87.5,51 87,52.8 85.5,51.8 84,52.8 84.5,51 83,50 84.8,50 85.5,48.2 86.2,50" fill="#C4892E"/>

  <circle cx="50" cy="50" r="28" fill="#1B365D"/>

  <!-- Stylized Heart with Elderly Figures -->
  <path d="M 50 69 C 33 57 28 47 31 38 C 33.5 30.5 43 31 50 38.5 C 57 31 66.5 30.5 69 38 C 72 47 67 57 50 69 Z" fill="#FFFFFF" opacity="0.95"/>
  <path d="M 50 66 C 36 55 31 46 34 39 C 36 33.5 44 34 50 40 C 56 34 64 33.5 66 39 C 69 46 64 55 50 66 Z" fill="#1B365D"/>

  <!-- Grandmother and Grandfather Silhouettes -->
  <circle cx="43" cy="45" r="4.5" fill="#FFFFFF"/>
  <ellipse cx="38" cy="44" rx="2" ry="2.5" fill="#FFFFFF"/>
  <circle cx="56" cy="44" r="5" fill="#FFFFFF"/>
  <path d="M 37 57 C 37 51 42 49 46 51 C 48 52 52 52 54 51 C 58 49 63 51 63 57 C 58 61 52 62 50 62 C 48 62 42 61 37 57 Z" fill="#FFFFFF"/>

  <!-- Accent -->
  <path d="M 50 56 C 48 54 46 54 46 55.5 C 46 57 48 58.5 50 59.5 C 52 58.5 54 57 54 55.5 C 54 54 52 54 50 56 Z" fill="#C82333"/>
</svg>`;
}

function getBagongPilipinasLogoMarkup(): string {
  if (BAGONG_PILIPINAS_LOGO_BASE64) {
    return `<img src="${BAGONG_PILIPINAS_LOGO_BASE64}" alt="" width="76" height="76" />`;
  }

  return `<svg width="76" height="76" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Sun and Rays in Center -->
  <circle cx="50" cy="38" r="8" fill="#F4B400"/>
  <g stroke="#F4B400" stroke-width="2" stroke-linecap="round">
    <line x1="50" y1="26" x2="50" y2="22"/>
    <line x1="50" y1="50" x2="50" y2="54"/>
    <line x1="38" y1="38" x2="34" y2="38"/>
    <line x1="62" y1="38" x2="66" y2="38"/>
    <line x1="41.5" y1="29.5" x2="38.5" y2="26.5"/>
    <line x1="58.5" y1="46.5" x2="61.5" y2="49.5"/>
    <line x1="41.5" y1="46.5" x2="38.5" y2="49.5"/>
    <line x1="58.5" y1="29.5" x2="61.5" y2="26.5"/>
  </g>

  <!-- 3 Stars -->
  <polygon points="50,15 51,17.5 53.5,17.5 51.5,19 52.3,21.5 50,20 47.7,21.5 48.5,19 46.5,17.5 49,17.5" fill="#F4B400"/>
  <polygon points="26,30 27,32.5 29.5,32.5 27.5,34 28.3,36.5 26,35 23.7,36.5 24.5,34 22.5,32.5 25,32.5" fill="#F4B400"/>
  <polygon points="74,30 75,32.5 77.5,32.5 75.5,34 76.3,36.5 74,35 71.7,36.5 72.5,34 70.5,32.5 73,32.5" fill="#F4B400"/>

  <!-- Left Blue Wing / Curve -->
  <path d="M 48 48 C 34 48 18 42 16 26 C 14 38 24 58 48 60 Z" fill="#0D47A1"/>
  <path d="M 46 54 C 34 54 22 48 20 36 C 21 44 28 58 46 62 Z" fill="#1976D2"/>
  <path d="M 46 60 C 37 60 28 55 26 46 C 29 53 36 62 46 64 Z" fill="#42A5F5"/>

  <!-- Right Red Wing / Curve -->
  <path d="M 52 48 C 66 48 82 42 84 26 C 86 38 76 58 52 60 Z" fill="#B71C1C"/>
  <path d="M 54 54 C 66 54 78 48 80 36 C 79 44 72 58 54 62 Z" fill="#D32F2F"/>
  <path d="M 54 60 C 63 60 72 55 74 46 C 71 53 64 62 54 64 Z" fill="#EF5350"/>

  <text x="50" y="80" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="8.5" font-weight="900" fill="#0B1B30" letter-spacing="0.5">
    BAGONG PILIPINAS
  </text>
</svg>`;
}

function renderHeader(annexRight = 'Annex "A"') {
  return `
    <div class="doc-header">
      <div class="annex-label">${escapeHtml(annexRight)}</div>
      <div class="header-content">
        <div class="logo-box">${getNcscLogoMarkup()}</div>
        <div class="header-titles">
          <div class="rep-title">Republic of the Philippines</div>
          <div class="pres-title">Office of the President</div>
          <div class="commission-title">NATIONAL COMMISSION OF SENIOR CITIZENS</div>
          <div class="address-line">4th Floor, AAP Tower, 683 Aurora Blvd, Mariana, 1117 Quezon City, Philippines</div>
          <div class="website-line">Official website: <u>www.ncsc.gov.ph</u></div>
        </div>
        <div class="logo-box">${getBagongPilipinasLogoMarkup()}</div>
      </div>
    </div>
  `;
}

export function generateBirthdayBenefitsFormHtml(data: BirthdayBenefitApplicationPdfData): string {
  let lastName = (data.applicant?.lastName || '').trim().toUpperCase();
  let firstName = (data.applicant?.firstName || '').trim().toUpperCase();
  let middleName = (data.applicant?.middleName || '').trim().toUpperCase();

  const anyData = data as any;
  if ((!firstName || !lastName) && anyData.applicantName) {
    const rawParts = String(anyData.applicantName).trim().split(/\s+/);
    if (rawParts.length === 1 && !firstName) {
      firstName = rawParts[0].toUpperCase();
    } else if (rawParts.length === 2 && !firstName && !lastName) {
      firstName = rawParts[0].toUpperCase();
      lastName = rawParts[1].toUpperCase();
    } else if (rawParts.length >= 3 && !firstName && !lastName) {
      firstName = rawParts[0].toUpperCase();
      middleName = rawParts.slice(1, -1).join(' ').toUpperCase();
      lastName = rawParts[rawParts.length - 1].toUpperCase();
    }
  }

  const applicantLastName = lastName || 'N/A';
  const applicantFirstName = firstName || 'N/A';
  const applicantMiddleName = middleName || 'N/A';
  const applicantFullName = [firstName, middleName, lastName]
    .filter((p) => p && p !== 'N/A')
    .join(' ')
    .trim() || (anyData.applicantName ? String(anyData.applicantName).trim().toUpperCase() : `USER #${data.user_id || ''}`);

  const oscaId = data.osca_id_number || data.applicant?.oscaIdNumber || (data.user_id ? `SA-${String(data.user_id).padStart(4, '0')}` : 'N/A');
  const rrn = data.ncsc_registration_reference_number || 'N/A';
  const dobFormatted = formatDate(data.date_of_birth || (data.applicant as any)?.dob);

  // Residential/address-abroad must not be substituted with a permanent address.
  const resAddrRaw = data.residential_address;
  const permAddrRaw = data.permanent_address_philippines || data.applicant?.address;

  const resAddr = parsePhilippineAddress(resAddrRaw);
  const permAddr = parsePhilippineAddress(permAddrRaw);

  const genderStr = (data.applicant?.gender || '').trim().toLowerCase();
  const isMale = genderStr === 'male';
  const isFemale = genderStr === 'female';

  const civilStatusStr = (data.applicant?.civilStatus || '').trim().toLowerCase();
  const isSingle = civilStatusStr === 'single';
  const isMarried = civilStatusStr === 'married';
  const isWidowed = civilStatusStr === 'widowed' || civilStatusStr === 'widow' || civilStatusStr === 'widower';
  const isOtherCivilStatus = !isSingle && !isMarried && !isWidowed && Boolean(data.applicant?.civilStatus);
  const otherCivilStatusText = isOtherCivilStatus ? data.applicant?.civilStatus || '' : '';

  const citizenshipStr = (data.citizenship || 'Filipino').trim();
  const isFilipino = citizenshipStr.toLowerCase().includes('filipino') && !data.is_dual_citizen;
  const isDual = Boolean(data.is_dual_citizen);
  const dualDetails = data.dual_citizenship_details || '';

  const spouseName = (data.spouse_name || '').trim().toUpperCase() || 'N/A';
  const spouseCitizenship = (data.spouse_citizenship || '').trim().toUpperCase() || 'N/A';

  const repName = (data.representative_name || '').trim().toUpperCase() || 'N/A';
  const repRelationship = (data.representative_relationship || '').trim().toUpperCase() || 'N/A';

  const contactNumber = data.contact_number || data.applicant?.contact || 'N/A';
  const emailAddress = data.email_address || data.applicant?.email || 'N/A';

  const applicantSignatureHtml = renderApplicantSignature(data.applicant?.digitalSignature || data.applicant?.signature)
    || renderApplicantSignature(data.applicant_signature);

  const applicationDateFormatted = formatDate(data.applicant_signature_date || data.date_of_application || data.created_at || new Date().toISOString());

  // Children rows (1 to 10)
  const childrenList = data.applicant?.children || [];
  const childrenRows = Array.from({ length: 10 }, (_, i) => {
    const child = childrenList[i];
    if (child) {
      const childName = (child.name || '').trim().toUpperCase();
      const childDob = child.dob ? ` (DOB: ${child.dob})` : '';
      return `${childName}${childDob}`;
    }
    return i === 0 && childrenList.length === 0 ? 'N/A' : '';
  });

  // Requirements status
  const hasForm = true;
  const hasPrimaryDoc = Boolean(data.birth_certificate_submitted || data.valid_id_submitted);
  const hasIdPic = Boolean(data.id_picture_submitted || data.applicant?.avatarUrl || data.id_picture_url);
  const hasFullBody = Boolean(data.full_body_picture_submitted || data.full_body_picture_url);
  const hasEndorsed = Boolean(data.endorsed_list_submitted || data.endorsed_list_url);

  // Initial Assessment
  const validationStatus = (data.validation_status || 'Pending').trim();
  const isEligible = validationStatus === 'Eligible' || validationStatus === 'Approved';
  const isIneligible = validationStatus === 'Ineligible' || validationStatus === 'Rejected';

  const validatedByName = data.validated_by_name ? data.validated_by_name.trim().toUpperCase() : 'PENDING REVIEW';
  const dateValidatedFormatted = data.date_validated ? formatDate(data.date_validated) : '—';

  const applicantPhotoHtml = data.id_picture_url || data.applicant?.avatarUrl
    ? `<img src="${escapeHtml(data.id_picture_url || data.applicant?.avatarUrl)}" class="id-photo-img" alt="2X2 ID Picture" />`
    : `<div class="id-photo-placeholder">“2X2 ID Picture”</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Annex A - NCSC Application Form</title>
  <style>
    @page {
      size: Letter portrait;
      margin: 8mm 10mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 12.35px;
      line-height: 1.2;
      color: #000;
      background: #FFFFFF;
    }

    .page {
      width: 100%;
      min-height: 262mm;
      page-break-after: always;
      break-after: page;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding-bottom: 20px;
    }

    .page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }

    /* HEADER */
    .doc-header {
      width: 100%;
      position: relative;
      margin-bottom: 4px;
    }

    .annex-label {
      text-align: right;
      font-size: 14.3px;
      font-weight: bold;
      color: #000;
      margin-bottom: 2px;
      padding-right: 4px;
    }

    .header-content {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .logo-box {
      width: 76px;
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .header-titles {
      flex: 1;
      text-align: center;
      padding: 0 10px;
    }

    .rep-title {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 14.3px;
      color: #000;
    }

    .pres-title {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 18.2px;
      font-weight: bold;
      font-style: italic;
      color: #000;
      margin-top: 1px;
    }

    .commission-title {
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 16.25px;
      font-weight: 900;
      letter-spacing: 0.3px;
      color: #000;
      margin-top: 2px;
    }

    .address-line, .website-line {
      font-size: 11.05px;
      color: #111;
      margin-top: 1px;
    }

    /* TITLE BOX */
    .title-banner {
      border: 1.5px solid #000;
      text-align: center;
      padding: 3px 6px;
      margin-top: 4px;
      background: #FFFFFF;
    }

    .title-banner .main-title {
      font-size: 15.6px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }

    .title-banner .sub-title {
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 0.2px;
      margin-top: 1px;
    }

    /* PURPOSE & INSTRUCTIONS SECTION WITH 2X2 BOX */
    .purpose-grid {
      display: flex;
      flex-direction: row;
      border: 1.5px solid #000;
      border-top: none;
      width: 100%;
    }

    .purpose-left {
      flex: 1;
      padding: 6px 8px;
      border-right: 1.5px solid #000;
    }

    .purpose-text {
      font-size: 12.35px;
      font-weight: bold;
      margin-bottom: 6px;
    }

    .instructions-heading {
      font-size: 12.35px;
      font-weight: bold;
      margin-bottom: 3px;
    }

    .instructions-list {
      margin: 0;
      padding-left: 18px;
      font-size: 11.7px;
      line-height: 1.35;
    }

    .photo-right {
      width: 135px;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .id-photo-frame {
      width: 110px;
      height: 110px;
      border: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #FAFAFA;
    }

    .id-photo-placeholder {
      font-size: 12.35px;
      font-style: italic;
      color: #444;
      text-align: center;
      padding: 10px;
    }

    .id-photo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* NOT FOR SALE BANNER */
    .not-for-sale {
      font-size: 11.7px;
      font-weight: bold;
      font-style: italic;
      padding: 3px 0;
      margin-top: 2px;
    }

    /* SECTION HEADERS (SOLID BLACK) */
    .section-banner {
      background: #000000;
      color: #FFFFFF;
      font-weight: 900;
      font-size: 12.35px;
      padding: 2.5px 6px;
      letter-spacing: 0.3px;
      border: 1px solid #000000;
      margin-top: 3px;
    }

    /* TABLES & CELLS */
    .form-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000000;
      margin-top: -1px;
    }

    .form-table td, .form-table th {
      border: 1px solid #000000;
      padding: 2.5px 5px;
      vertical-align: top;
      font-size: 11.7px;
    }

    .cell-label {
      font-size: 10.4px;
      font-weight: bold;
      color: #000;
      text-transform: uppercase;
      line-height: 1.15;
      margin-bottom: 2px;
    }

    .cell-value {
      font-size: 12.35px;
      font-weight: bold;
      color: #000;
      min-height: 13px;
    }

    .sub-columns-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2px;
    }

    .sub-columns-table td {
      border: 1px solid #000;
      padding: 5px 5px;
      font-size: 11.05px;
      width: 16.66%;
    }

    .sub-col-header {
      font-size: 9.75px;
      color: #333;
      text-align: center;
      margin-bottom: 1px;
    }

    .sub-col-val {
      font-size: 11.7px;
      font-weight: bold;
      text-align: center;
      min-height: 12px;
      word-break: break-word;
    }

    /* CHECKBOXES & RADIOS */
    .checkbox-item {
      display: inline-flex;
      align-items: center;
      margin-right: 14px;
      margin-top: 2px;
      font-size: 11.7px;
    }

    .box-square {
      width: 11px;
      height: 11px;
      border: 1.2px solid #000;
      margin-right: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11.7px;
      font-weight: bold;
      line-height: 1;
    }

    .radio-circle {
      width: 11px;
      height: 11px;
      border: 1.2px solid #000;
      border-radius: 50%;
      margin-right: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10.4px;
      font-weight: bold;
      line-height: 1;
    }

    /* CERTIFICATION & NOTARY */
    .certification-text {
      font-size: 11.05px;
      line-height: 1.25;
      text-align: justify;
      padding: 4px 6px;
    }

    .signature-row {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      min-height: 38px;
      padding-top: 10px;
    }

    .signature-line-text {
      border-top: 1px solid #000;
      width: 70%;
      text-align: center;
      font-size: 11.05px;
      font-weight: bold;
      padding-top: 2px;
      margin-top: 2px;
    }

    .notary-section {
      padding: 5px 6px;
      font-size: 11.05px;
      line-height: 1.35;
    }

    .notary-grid {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      margin-top: 6px;
      padding: 0 4px;
    }

    .notary-docket {
      font-size: 11.05px;
      line-height: 1.4;
    }

    .notary-stamp {
      text-align: center;
      min-width: 180px;
      padding-top: 24px;
    }

    .notary-title {
      border-top: 1px solid #000;
      font-size: 11.7px;
      font-weight: bold;
      padding-top: 3px;
    }

    /* DATA PRIVACY */
    .privacy-text {
      font-size: 11.05px;
      line-height: 1.25;
      text-align: justify;
      padding: 4px 6px;
    }

    /* FOOTER */
    .page-footer {
      position: absolute;
      bottom: 2px;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      font-size: 11.05px;
      color: #000;
      padding: 0 4px;
    }

    .page-footer-center {
      text-align: center;
      width: 100%;
    }

    /* DOCUMENTARY REQUIREMENTS TABLE */
    .req-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000;
      margin-top: -1px;
    }

    .req-table th {
      border: 1px solid #000;
      background: #F3F3F3;
      font-size: 11.05px;
      font-weight: bold;
      padding: 4px 5px;
      text-align: center;
    }

    .req-table td {
      border: 1px solid #000;
      padding: 3px 5px;
      vertical-align: top;
      font-size: 11.05px;
      line-height: 1.25;
    }

    .col-applicant-type {
      width: 15%;
      font-weight: bold;
      text-align: center;
      vertical-align: middle !important;
      background: #FAFAFA;
    }

    .col-req-desc {
      width: 47%;
    }

    .col-complied {
      width: 8%;
      text-align: center;
      font-weight: bold;
    }

    .col-remarks {
      width: 22%;
      font-size: 10.4px;
    }

    /* FINDINGS BOX */
    .findings-box {
      border: 1px solid #000;
      min-height: 110px;
      padding: 6px;
      font-size: 11.7px;
      line-height: 1.35;
      background: #FFFFFF;
    }

    .assessment-box {
      border: 1px solid #000;
      border-top: none;
      padding: 6px 10px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 30px;
    }

    /* Keep the form readable while retaining the original four-page layout. */
    body {
      font-size: 13.65px;
      line-height: 1.18;
    }

    .page {
      padding-bottom: 14px;
    }

    .annex-label {
      font-size: 15.6px;
    }

    .rep-title {
      font-size: 15.6px;
    }

    .pres-title {
      font-size: 19.5px;
    }

    .commission-title {
      font-size: 17.55px;
    }

    .address-line,
    .website-line {
      font-size: 11.7px;
    }

    .title-banner {
      padding: 2px 5px;
    }

    .title-banner .main-title {
      font-size: 16.9px;
    }

    .title-banner .sub-title {
      font-size: 13.65px;
    }

    .purpose-left {
      padding: 5px 7px;
    }

    .purpose-text,
    .instructions-heading {
      font-size: 13.65px;
    }

    .instructions-list {
      font-size: 13px;
      line-height: 1.25;
    }

    .not-for-sale,
    .section-banner {
      font-size: 13.65px;
    }

    .section-banner {
      padding: 2px 5px;
    }

    .form-table td,
    .form-table th {
      padding: 5px 5px;
      font-size: 13px;
    }

    .cell-label {
      font-size: 11.44px;
    }

    .cell-value {
      font-size: 13.65px;
      min-height: 12px;
    }

    .sub-columns-table td {
      padding: 4px 3px;
      font-size: 12.35px;
    }

    .sub-col-header {
      font-size: 11.05px;
    }

    .sub-col-val {
      font-size: 13px;
    }

    .checkbox-item {
      font-size: 13px;
    }

    .certification-text,
    .notary-section,
    .privacy-text {
      font-size: 12.35px;
    }

    .signature-line-text,
    .notary-docket {
      font-size: 12.35px;
    }

    .req-table th,
    .req-table td {
      font-size: 12.35px;
    }

    .findings-box {
      font-size: 13px;
    }

    .page-footer {
      font-size: 12.35px;
    }

    /* Physical page dimensions keep native and browser printing consistent. */
    .page { padding-bottom: 24px; }
    .cell-value, .sub-col-val { overflow-wrap: anywhere; }
    .form-table tr, .req-table tr { break-inside: avoid; }
    .page-1 .cell-value { min-height: 21px; }
    .page-1 .form-table > tbody > tr > td { padding-top: 7px; padding-bottom: 7px; }
    .page-2 .certification-text, .page-2 .privacy-text { line-height: 1.45; }
    .findings-box { min-height: 170px; }
    .applicant-signature { height: 54px; text-align: center; margin: 0 auto 2px; }
    .applicant-signature img { width: 220px; height: 52px; object-fit: contain; }
    .applicant-signature svg { max-width: 100%; }
  </style>
</head>
<body>

  <!-- ==================== PAGE 1 ==================== -->
  <div class="page page-1">
    ${renderHeader('Annex "A"')}

    <div class="title-banner">
      <div class="main-title">APPLICATION FORM</div>
      <div class="sub-title">OCTOGENARIAN, NONAGENARIAN AND CENTENARIAN BENEFIT PROGRAM</div>
    </div>

    <div class="purpose-grid">
      <div class="purpose-left">
        <div class="purpose-text">PURPOSE: To claim the benefits under Republic Act (R.A.) No. 11982.</div>
        <div class="instructions-heading">INSTRUCTIONS:</div>
        <ol class="instructions-list">
          <li>Fill out this form completely and correctly.</li>
          <li>Do not leave any blank space. If not applicable, kindly indicate "N/A".</li>
          <li>Write in BLOCK letters.</li>
        </ol>
      </div>
      <div class="photo-right">
        <div class="id-photo-frame">
          ${applicantPhotoHtml}
        </div>
      </div>
    </div>

    <div class="not-for-sale">This application form is not for sale.</div>

    <!-- SECTION A -->
    <div class="section-banner">A. PERSONAL INFORMATION</div>
    <table class="form-table">
      <tr>
        <td style="width: 50%;">
          <div class="cell-label">NCSC REGISTRATION REFERENCE NUMBER (RRN)</div>
          <div class="cell-value">${escapeHtml(rrn)}</div>
        </td>
        <td style="width: 50%;">
          <div class="cell-label">OSCA ID NUMBER</div>
          <div class="cell-value">${escapeHtml(oscaId)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="cell-label">A.1 LAST NAME</div>
          <div class="cell-value">${escapeHtml(applicantLastName)}</div>
        </td>
      </tr>
      <tr>
        <td style="width: 50%;">
          <div class="cell-label">A.2 GIVEN NAME</div>
          <div class="cell-value">${escapeHtml(applicantFirstName)}</div>
        </td>
        <td style="width: 50%;">
          <div class="cell-label">A.3. MIDDLE NAME</div>
          <div class="cell-value">${escapeHtml(applicantMiddleName)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="cell-label">A.4. DATE OF BIRTH (Month/Day/Year)</div>
          <div class="cell-value">${escapeHtml(dobFormatted || 'N/A')}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 3px;">
          <div class="cell-label" style="padding-left: 2px;">A.5. RESIDENTIAL ADDRESS/ADDRESS ABROAD</div>
          <table class="sub-columns-table">
            <tr>
              <td class="sub-col-header">House Number</td>
              <td class="sub-col-header">Street</td>
              <td class="sub-col-header">Barangay</td>
              <td class="sub-col-header">City/Municipality</td>
              <td class="sub-col-header">Province</td>
              <td class="sub-col-header">Zip Code</td>
            </tr>
            <tr>
              <td class="sub-col-val">${escapeHtml(resAddr.houseNumber)}</td>
              <td class="sub-col-val">${escapeHtml(resAddr.street)}</td>
              <td class="sub-col-val">${escapeHtml(resAddr.barangay)}</td>
              <td class="sub-col-val">${escapeHtml(resAddr.city)}</td>
              <td class="sub-col-val">${escapeHtml(resAddr.province)}</td>
              <td class="sub-col-val">${escapeHtml(resAddr.zipCode)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 3px;">
          <div class="cell-label" style="padding-left: 2px;">A.6. PERMANENT ADDRESS IN THE PHILIPPINES</div>
          <table class="sub-columns-table">
            <tr>
              <td class="sub-col-header">House Number</td>
              <td class="sub-col-header">Street</td>
              <td class="sub-col-header">Barangay</td>
              <td class="sub-col-header">City/Municipality</td>
              <td class="sub-col-header">Province</td>
              <td class="sub-col-header">Zip Code</td>
            </tr>
            <tr>
              <td class="sub-col-val">${escapeHtml(permAddr.houseNumber)}</td>
              <td class="sub-col-val">${escapeHtml(permAddr.street)}</td>
              <td class="sub-col-val">${escapeHtml(permAddr.barangay)}</td>
              <td class="sub-col-val">${escapeHtml(permAddr.city)}</td>
              <td class="sub-col-val">${escapeHtml(permAddr.province)}</td>
              <td class="sub-col-val">${escapeHtml(permAddr.zipCode)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 4px;">
          <div style="display: flex; flex-direction: row; justify-content: space-between;">
            <!-- SEX -->
            <div style="width: 28%; border-right: 1px solid #000; padding-right: 4px;">
              <div class="cell-label">A.7. SEX</div>
              <div style="margin-top: 4px;">
                <span class="checkbox-item"><span class="box-square">${isMale ? '✓' : ''}</span> Male</span>
                <span class="checkbox-item"><span class="box-square">${isFemale ? '✓' : ''}</span> Female</span>
              </div>
            </div>

            <!-- CIVIL STATUS -->
            <div style="width: 38%; border-right: 1px solid #000; padding: 0 6px;">
              <div class="cell-label">A.8. CIVIL STATUS</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-top: 3px;">
                <span class="checkbox-item"><span class="box-square">${isSingle ? '✓' : ''}</span> Single</span>
                <span class="checkbox-item"><span class="box-square">${isWidowed ? '✓' : ''}</span> Widowed</span>
                <span class="checkbox-item"><span class="box-square">${isMarried ? '✓' : ''}</span> Married</span>
                <span class="checkbox-item"><span class="box-square">${isOtherCivilStatus ? '✓' : ''}</span> Others${otherCivilStatusText ? `: ${escapeHtml(otherCivilStatusText)}` : ''}</span>
              </div>
            </div>

            <!-- CITIZENSHIP -->
            <div style="width: 34%; padding-left: 6px;">
              <div class="cell-label">A.9. CITIZENSHIP</div>
              <div style="margin-top: 3px;">
                <span class="checkbox-item"><span class="box-square">${isFilipino ? '✓' : ''}</span> Filipino</span><br>
                <span class="checkbox-item" style="margin-top: 2px;"><span class="box-square">${isDual ? '✓' : ''}</span> Dual citizen</span>
                <div style="font-size: 10.4px; margin-top: 2px; padding-left: 15px; color: #333;">
                  If dual citizen, kindly indicate details: <u>${escapeHtml(dualDetails || 'N/A')}</u>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- SECTION B -->
    <div class="section-banner">B. FAMILY INFORMATION</div>
    <table class="form-table">
      <tr>
        <td style="width: 70%;">
          <div class="cell-label">B.1. NAME OF SPOUSE (LAST NAME, GIVEN NAME, FULL MIDDLE NAME)</div>
          <div class="cell-value">${escapeHtml(spouseName)}</div>
        </td>
        <td style="width: 30%;">
          <div class="cell-label">B.2. CITIZENSHIP</div>
          <div class="cell-value">${escapeHtml(spouseCitizenship)}</div>
        </td>
      </tr>
    </table>

    <div class="page-footer">
      <div class="page-footer-center">Page 1 of 4</div>
    </div>
  </div>

  <!-- ==================== PAGE 2 ==================== -->
  <div class="page page-2">
    <div class="section-banner" style="margin-top: 0;">B. FAMILY INFORMATION (Continued)</div>
    <table class="form-table">
      <tr>
        <td>
          <div class="cell-label">B.3. NAME OF CHILDREN (LAST NAME, GIVEN NAME, FULL MIDDLE NAME)</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin-top: 3px;">
            ${childrenRows.map((child, idx) => `
              <div style="font-size: 11.05px; border-bottom: 0.8px dotted #666; padding: 2px 0;">
                <strong style="display: inline-block; width: 18px;">${idx + 1}.</strong> ${escapeHtml(child)}
              </div>
            `).join('')}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding: 0;">
          <div class="cell-label" style="padding: 3px 5px; background: #FAFAFA; border-bottom: 1px solid #000;">
            B.4 AUTHORIZED REPRESENTATIVE/S
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #F3F3F3;">
              <th style="width: 65%; border-right: 1px solid #000; padding: 3px 5px; text-align: left; font-size: 10.4px;">Name of Representative/s</th>
              <th style="width: 35%; padding: 3px 5px; text-align: left; font-size: 10.4px;">Relationship</th>
            </tr>
            <tr>
              <td style="border-right: 1px solid #000; border-top: 1px solid #000; padding: 3px 5px;">
                <span style="font-size: 10.4px; font-weight: bold; margin-right: 6px;">B.4.1</span>
                <strong>${escapeHtml(repName)}</strong>
              </td>
              <td style="border-top: 1px solid #000; padding: 3px 5px;">
                ${escapeHtml(repRelationship)}
              </td>
            </tr>
            <tr>
              <td style="border-right: 1px solid #000; border-top: 1px solid #000; padding: 3px 5px;">
                <span style="font-size: 10.4px; font-weight: bold; margin-right: 6px;">B.4.2</span>
                <span style="color: #666;">N/A</span>
              </td>
              <td style="border-top: 1px solid #000; padding: 3px 5px;">
                <span style="color: #666;">N/A</span>
              </td>
            </tr>
            <tr>
              <td style="border-right: 1px solid #000; border-top: 1px solid #000; padding: 3px 5px;">
                <span style="font-size: 10.4px; font-weight: bold; margin-right: 6px;">B.4.3</span>
                <span style="color: #666;">N/A</span>
              </td>
              <td style="border-top: 1px solid #000; padding: 3px 5px;">
                <span style="color: #666;">N/A</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- SECTION C -->
    <div class="section-banner">C. CONTACT INFORMATION</div>
    <table class="form-table">
      <tr>
        <td style="width: 50%;">
          <div class="cell-label">C.1. CONTACT NUMBERS (TELEPHONE AND MOBILE NUMBERS)</div>
          <div class="cell-value">${escapeHtml(contactNumber)}</div>
        </td>
        <td style="width: 50%;">
          <div class="cell-label">C.2. EMAIL ADDRESS</div>
          <div class="cell-value">${escapeHtml(emailAddress)}</div>
        </td>
      </tr>
    </table>

    <!-- SECTION D -->
    <div class="section-banner">D. CERTIFICATION</div>
    <table class="form-table">
      <tr>
        <td class="certification-text">
          I hereby certify under oath that all the information in this application form are true and correct. I authorize the verification of the information provided in this form as well as the usage and processing of the information by the National Commission of Senior Citizens in accordance with the R.A. No. 10173, otherwise known as the "Data Privacy Act of 2012", its Implementing Rules and Regulations, and issuances of the National Privacy Commission. I further warrant that I have complied with all the requirements and I have presented all pertinent documentary requirements. I understand that my application shall not be processed if any statement herein made is found to be false, or if any document I submitted is found to have been falsified, or if I fail to comply with all the requirements with respect to my application, without prejudice to whatever actions that may be taken against me in accordance with the applicable laws of the Republic of the Philippines. Further, I hereby certify that I have not commenced the application/processing for the cash benefits as provided for under R.A. No. 11982 before any government agency.
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 10px 4px 10px;">
          ${applicantSignatureHtml}
          <div style="text-align: center; font-size: 14.3px; font-weight: 900; letter-spacing: 0.5px; border-bottom: 1.5px solid #000; width: 80%; margin: 0 auto 3px auto; padding-bottom: 2px;">
            ${escapeHtml(applicantFullName)}
          </div>
          <div style="text-align: center; font-size: 11.05px; font-weight: bold;">
            NAME AND SIGNATURE/THUMBMARK OF APPLICANT
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 10px;">
          <div class="cell-label">DATE OF APPLICATION</div>
          <div class="cell-value">${escapeHtml(applicationDateFormatted)}</div>
        </td>
      </tr>
      <tr>
        <td class="notary-section">
          SUBSCRIBED AND SWORN TO BEFORE ME, this ______ day of ________________________, at ____________________________, the affiant exhibited to me his/her <u>${escapeHtml(oscaId ? 'OSCA DIGITAL ID' : 'GOVERNMENT ID')}</u> with ID number <u>${escapeHtml(oscaId)}</u> issued at <u>PATEROS</u> on <u>${escapeHtml(applicationDateFormatted)}</u>, valid until <u>PERMANENT</u>.

          <div class="notary-grid">
            <div class="notary-docket">
              Doc. No. &nbsp;_______<br>
              Page No. &nbsp;_______<br>
              Book No. &nbsp;_______<br>
              Series of &nbsp;_______
            </div>
            <div class="notary-stamp">
              <div class="notary-title">NOTARY PUBLIC</div>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- DATA PRIVACY -->
    <div class="section-banner">DATA PRIVACY</div>
    <table class="form-table">
      <tr>
        <td class="privacy-text">
          In compliance with the provisions of R.A. No. 10173, otherwise known as the "Data Privacy Act of 2012", its Implementing Rules and Regulations, and issuances of the National Privacy Commission, the National Commission of Senior Citizens ensures that the personal information provided is collected, used, and processed by its authorized personnel and shall only be used for the implementation of R.A. No. 11982.
        </td>
      </tr>
    </table>

    <div class="page-footer">
      <div class="page-footer-center">Page 2 of 4</div>
    </div>
  </div>

  <!-- ==================== PAGE 3 ==================== -->
  <div class="page page-3">
    ${renderHeader('Annex "A"')}

    <div class="section-banner" style="margin-top: 6px;">
      G. DOCUMENTARY REQUIREMENTS <span style="font-weight: normal; font-style: italic;">(to be filled-up by NCSC personnel only)</span>
    </div>

    <table class="req-table">
      <thead>
        <tr>
          <th style="width: 14%;">Applicants</th>
          <th style="width: 48%;">Requirements</th>
          <th colspan="2" style="width: 14%;">Complied</th>
          <th style="width: 24%;">Remarks<br><span style="font-size: 9.1px; font-weight: normal; font-style: italic;">In the absence of primary ID, kindly cite secondary documents presented</span></th>
        </tr>
        <tr>
          <th></th>
          <th></th>
          <th style="width: 7%; font-size: 10.4px;">Yes</th>
          <th style="width: 7%; font-size: 10.4px;">No</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <!-- LOCAL APPLICANTS -->
        <tr>
          <td rowspan="5" class="col-applicant-type">Local<br>Applicants</td>
          <td class="col-req-desc">
            <strong>a.)</strong> Duly accomplished application form "Annex A";
          </td>
          <td class="col-complied">${hasForm ? '✓' : ''}</td>
          <td class="col-complied">${!hasForm ? '✓' : ''}</td>
          <td class="col-remarks">Accomplished via AUREA portal</td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>b.)</strong> Any one (1) of the following primary documents:<br>
            <div style="padding-left: 12px; margin-top: 2px;">
              1. Certificate of Live Birth duly issued or authenticated by the Philippine Statistics Authority (PSA);<br>
              2. Photocopy of Philippine Identification System ID card / Philippine ID card / National ID card provided that the original copy must be presented.
            </div>
            <div style="font-size: 9.75px; font-style: italic; margin-top: 2px; color: #444;">
              ***In the absence of primary ID/documents, any two (2) of the following secondary ID cards/documents shall be submitted as indicated in the Item VI of Implementing Guidelines.
            </div>
          </td>
          <td class="col-complied">${hasPrimaryDoc ? '✓' : ''}</td>
          <td class="col-complied">${!hasPrimaryDoc ? '✓' : ''}</td>
          <td class="col-remarks">
            ${data.birth_certificate_submitted ? 'PSA Birth Certificate submitted.<br>' : ''}
            ${data.valid_id_submitted ? 'Digital OSCA ID verified.' : ''}
          </td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>c.)</strong> Recent 5.08 cm x 5.08 cm (2"x 2") ID picture
          </td>
          <td class="col-complied">${hasIdPic ? '✓' : ''}</td>
          <td class="col-complied">${!hasIdPic ? '✓' : ''}</td>
          <td class="col-remarks">${hasIdPic ? 'Photo attached.' : 'Missing photo.'}</td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>d.)</strong> Full body picture of the applicant printed on an A4 size bond/photo paper; and
          </td>
          <td class="col-complied">${hasFullBody ? '✓' : ''}</td>
          <td class="col-complied">${!hasFullBody ? '✓' : ''}</td>
          <td class="col-remarks">${hasFullBody ? 'Full-body photo submitted.' : 'Pending submission.'}</td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>e.)</strong> Applicant's inclusion to the endorsed list for validation issued by the Local Chief Executive.
          </td>
          <td class="col-complied">${hasEndorsed ? '✓' : ''}</td>
          <td class="col-complied">${!hasEndorsed ? '✓' : ''}</td>
          <td class="col-remarks">${hasEndorsed ? 'LGU Pateros Endorsement List' : 'Subject to LGU validation'}</td>
        </tr>

        <!-- LIVING ABROAD (Part 1) -->
        <tr>
          <td rowspan="2" class="col-applicant-type">Applicants<br>Living Abroad</td>
          <td class="col-req-desc">
            <strong>a.)</strong> Duly accomplished application form "Annex A";
          </td>
          <td class="col-complied"></td>
          <td class="col-complied"></td>
          <td class="col-remarks"></td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>b.)</strong> Any one (1) of the following primary documents:<br>
            <div style="padding-left: 12px; margin-top: 2px;">
              1. Valid Philippine Passport;<br>
              2. Citizen Retention and Re-acquisition Certificate and Identification Certificate, or Order of Approval, or Oath of Allegiance, or Certificate of Attestation duly issued by the Philippine Embassy (PE) or Philippine Consulate General (PCG) of the Department of Foreign Affairs (DFA) who has jurisdiction in the area where the applicant resides.
            </div>
            <div style="font-size: 9.75px; font-style: italic; margin-top: 2px; color: #444;">
              ***In the absence of primary ID/documents, any two (2) of the following secondary ID cards/documents shall be submitted as indicated in the Item VI of Implementing Guidelines.
            </div>
          </td>
          <td class="col-complied"></td>
          <td class="col-complied"></td>
          <td class="col-remarks"></td>
        </tr>
      </tbody>
    </table>

    <div class="page-footer">
      <div></div>
      <div style="text-align: center;">Page 3 of 4</div>
      <div>01.31.2025</div>
    </div>
  </div>

  <!-- ==================== PAGE 4 ==================== -->
  <div class="page page-4">
    ${renderHeader('Annex "A"')}

    <div class="section-banner" style="margin-top: 6px;">
      G. DOCUMENTARY REQUIREMENTS <span style="font-weight: normal; font-style: italic;">(continued)</span>
    </div>

    <table class="req-table">
      <thead>
        <tr>
          <th style="width: 14%;">Applicants</th>
          <th style="width: 48%;">Requirements</th>
          <th style="width: 7%; font-size: 10.4px;">Yes</th>
          <th style="width: 7%; font-size: 10.4px;">No</th>
          <th style="width: 24%;">Remarks</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td rowspan="3" class="col-applicant-type">Applicants<br>Living Abroad</td>
          <td class="col-req-desc">
            <strong>c.)</strong> Recent 5.08 cm x 5.08 cm (2"x 2") ID picture
          </td>
          <td class="col-complied"></td>
          <td class="col-complied"></td>
          <td class="col-remarks"></td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>d.)</strong> Full body picture of the applicant printed on an A4 size bond/photo paper; and
          </td>
          <td class="col-complied"></td>
          <td class="col-complied"></td>
          <td class="col-remarks"></td>
        </tr>
        <tr>
          <td class="col-req-desc">
            <strong>e.)</strong> Applicant's inclusion to the endorsed list issued by the PE/Consulate or the DFA or the Department of Migrant Workers (DMW) or the Commission on Filipinos Overseas (CFO).
          </td>
          <td class="col-complied"></td>
          <td class="col-complied"></td>
          <td class="col-remarks"></td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION H -->
    <div class="section-banner">
      H. VALIDATION ASSESSMENT REPORT <span style="font-weight: normal; font-style: italic;">(to be filled-up by NCSC personnel only)</span>
    </div>

    <div style="border: 1.5px solid #000; margin-top: -1px;">
      <div style="background: #FAFAFA; font-weight: bold; font-size: 11.05px; padding: 3px 6px; border-bottom: 1px solid #000;">
        H.1 FINDINGS/CONCERNS/RECOMMENDATIONS
      </div>
      <div class="findings-box">
        ${escapeHtml(data.findings_concerns_recommendations) || `
          <div style="color: #666; font-style: italic;">
            Applicant registered for ${escapeHtml(data.benefit_type || 'Senior')} Benefit Program under R.A. No. 11982.<br>
            All basic documentary requirements verified via Pateros OSCA Portal.
          </div>
        `}
      </div>

      <div class="assessment-box">
        <strong style="font-size: 11.7px; margin-right: 15px;">H.2 INITIAL ASSESSMENT:</strong>
        <span class="checkbox-item" style="font-size: 12.35px; font-weight: bold;">
          <span class="radio-circle">${isEligible ? '●' : ''}</span> Eligible
        </span>
        <span class="checkbox-item" style="font-size: 12.35px; font-weight: bold;">
          <span class="radio-circle">${isIneligible ? '●' : ''}</span> Ineligible
        </span>
      </div>
    </div>

    <!-- VALIDATED BY -->
    <div class="section-banner">
      VALIDATED BY <span style="font-weight: normal; font-style: italic;">(to be filled-up by NCSC personnel only)</span>
    </div>
    <table class="form-table">
      <tr>
        <td style="width: 50%; padding: 6px;">
          <div class="cell-label">Name</div>
          <div class="cell-value" style="font-size: 13px;">${escapeHtml(validatedByName)}</div>
        </td>
        <td style="width: 50%; padding: 6px; text-align: center; vertical-align: bottom;">
          <div style="border-bottom: 1px solid #000; width: 85%; margin: 0 auto 3px auto; min-height: 20px;"></div>
          <div style="font-size: 10.4px; font-style: italic;">(Signature over printed name)</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 5px 6px;">
          <span class="cell-label" style="display: inline-block; margin-right: 10px;">Date Validated:</span>
          <strong>${escapeHtml(dateValidatedFormatted)}</strong>
        </td>
      </tr>
    </table>

    <!-- APPLICANT SIGNATURE REAFFIRMATION -->
    <div class="section-banner">APPLICANT NAME AND SIGNATURE</div>
    <table class="form-table">
      <tr>
        <td style="padding: 12px 10px 6px 10px; text-align: center;">
          ${applicantSignatureHtml}
          <div style="font-size: 14.3px; font-weight: 900; letter-spacing: 0.5px; border-bottom: 1.5px solid #000; width: 75%; margin: 0 auto 3px auto; padding-bottom: 2px;">
            ${escapeHtml(applicantFullName)}
          </div>
          <div style="font-size: 11.05px; font-weight: bold;">
            NAME AND SIGNATURE/THUMBMARK OF APPLICANT
          </div>
        </td>
      </tr>
    </table>

    <!-- DATA PRIVACY -->
    <div class="section-banner">DATA PRIVACY</div>
    <table class="form-table">
      <tr>
        <td class="privacy-text">
          In compliance with the provisions of R.A. No. 10173, otherwise known as the "Data Privacy Act of 2012", its Implementing Rules and Regulations, and issuances of the National Privacy Commission, the National Commission of Senior Citizens ensures that the personal information provided is collected, used, and processed by its authorized personnel and shall only be used for the implementation of R.A. No. 11982.
        </td>
      </tr>
    </table>

    <div class="page-footer">
      <div></div>
      <div style="text-align: center;">Page 4 of 4</div>
      <div>01.31.2025</div>
    </div>
  </div>

</body>
</html>`;
}

export async function openBirthdayBenefitsFormPreview(data: BirthdayBenefitApplicationPdfData): Promise<void> {
  const html = generateBirthdayBenefitsFormHtml(data);
  if (Platform.OS !== 'web') {
    await Print.printAsync({ html });
    return;
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    }
  }
}

export async function exportBirthdayBenefitsFormPdf(
  data: BirthdayBenefitApplicationPdfData,
  options?: { openInNewTab?: boolean }
): Promise<void> {
  const html = generateBirthdayBenefitsFormHtml(data);

  if (Platform.OS === 'web') {
    if (options?.openInNewTab) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
          win.focus();
          win.print();
        }, 400);
        return;
      }
    }

    // On Web, expo-print's Print.printAsync completely ignores html and just calls window.print()
    // on the current screen. To properly print the generated document, we use an invisible iframe.
    const iframe = document.createElement('iframe');
    iframe.setAttribute(
      'style',
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
    );
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc || !iframe.contentWindow) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
          win.focus();
          win.print();
        }, 400);
      }
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let finished = false;
    const triggerPrint = () => {
      if (finished) return;
      finished = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print failed, falling back to popup window', err);
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(html);
          win.document.close();
          setTimeout(() => {
            win.focus();
            win.print();
          }, 400);
        }
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }
    };

    setTimeout(triggerPrint, 350);
    return;
  }

  // Native iOS / Android. The printer can return a path outside Expo Go's
  // scoped storage. Write the bytes into our own cache before sharing.
  if (!(await Sharing.isAvailableAsync())) {
    await Print.printAsync({ html });
    return;
  }

  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) {
    throw new Error('Could not generate the PDF. Please try exporting again.');
  }

  const directory = Paths.cache;
  const pdf = new File(directory, `NCSC-Annex-A-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  await pdf.write(base64, { encoding: 'base64' });
  if (!pdf.exists || pdf.size === 0) {
    throw new Error('Could not save the PDF. Please try exporting again.');
  }

  // Keep the cached file available while the receiving app reads it.
  await Sharing.shareAsync(pdf.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Export NCSC Annex A Application Form',
      UTI: 'com.adobe.pdf',
  });
}
