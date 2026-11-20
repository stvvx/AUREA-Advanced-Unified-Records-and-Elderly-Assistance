import { API_BASE_URL } from './loloApi';

export const physicalIdTypes = {
  new: 'Unang physical card',
  lost: 'Palitan ang nawalang card',
  worn: 'Palitan ang lumang card',
  coverage: 'PhilHealth coverage assistance',
  'social-pension': 'Social Pension',
  transfer: 'Certificate of Transfer at OSCA membership cancellation',
  medical: 'Medical assistance para sa sarili',
  burial: 'Burial assistance para sa yumaong senior',
} as const;

export type PhysicalIdType = 'new' | 'lost' | 'worn';
export type OscaDocumentService = 'physical-id' | 'philhealth' | 'social-pension' | 'purchase-booklet' | 'osca-transfer' | 'financial-assistance';

const bookletTypes: Partial<Record<keyof typeof physicalIdTypes, string>> = {
  new: 'Unang Purchase Booklet',
  lost: 'Palitan ang nawalang booklet',
  worn: 'Palitan ang lumang booklet',
};

export function requestTypeLabel(service: OscaDocumentService, requestType: keyof typeof physicalIdTypes) {
  return (service === 'purchase-booklet' ? bookletTypes[requestType] : undefined) ?? physicalIdTypes[requestType];
}
export type OscaDocumentApplication = {
  id: string;
  request_type: keyof typeof physicalIdTypes;
  status: 'Pending' | 'Ready for pickup' | 'Released' | 'Returned' | 'Endorsed' | 'Approved';
  review_note?: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
};

export type OscaDocumentRequirements = {
  previousDestination?: string;
  previousBeneficiary?: string;
  missingProfile: string[];
  needsSignature: boolean;
  eligibilityMessage: string | null;
  documents: { key: string; label: string; onFile: boolean; previouslyAttached?: boolean }[];
};

export async function oscaDocumentRequest<T>(token: string, service: OscaDocumentService, path = '', method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/${service}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || 'Hindi available ngayon ang OSCA service. Subukan ulit.');
  return data;
}
