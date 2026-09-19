import { API_BASE_URL } from './loloApi';

export type OctogenarianBenefitApplication = {
  user_id: number;
  osca_id_number?: string;
  date_of_birth: string;
  benefit_type: 'Octogenarian' | 'Nonagenarian' | 'Centenarian';
  date_of_application?: string;
  residential_address: string;
  permanent_address_philippines: string;
  spouse_name?: string;
  spouse_citizenship?: string;
  representative_name?: string;
  representative_relationship?: string;
  contact_number: string;
  email_address: string;
  citizenship?: string;
  is_dual_citizen: boolean;
  dual_citizenship_details?: string;
  full_body_picture_submitted: boolean;
  endorsed_list_submitted: boolean;
  full_body_picture_base64: string;
  full_body_picture_mime_type: string;
  endorsed_list_base64?: string;
  endorsed_list_mime_type?: string;
  applicant_signature?: string;
  applicant_signature_date?: string;
};

export async function submitOctogenarianBenefitApplication(
  application: OctogenarianBenefitApplication,
): Promise<{ success: boolean; application: Record<string, unknown> }> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/benefit-applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(application),
    });
  } catch {
    throw new Error(
      `Cannot reach API server at ${API_BASE_URL}. Ensure the backend is running and your phone is on the same Wi-Fi.`,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Unable to submit the benefit application.');
  }

  return data as { success: boolean; application: Record<string, unknown> };
}
