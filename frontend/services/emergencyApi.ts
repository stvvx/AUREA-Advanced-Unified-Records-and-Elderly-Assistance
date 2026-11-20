import { API_BASE_URL } from './loloApi';

export type EmergencyReport = {
  id: string;
  category: string;
  status: 'Submitted' | 'Acknowledged' | 'Closed';
  review_note?: string | null;
  reporter?: string;
  created_at: string;
};

export const emergencyStatus = {
  Submitted: 'Na-save na ang report. Naghihintay ng review.',
  Acknowledged: 'Nabasa na ng OSCA ang report.',
  Closed: 'Isinara na ng OSCA ang report.',
};

export function emergencyReportTime(value: string) {
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
}

export async function emergencyRequest<T>(
  token: string,
  path = '',
  method = 'GET',
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/emergency-reports${path}`, {
      method,
      signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Hindi makakonekta. Kung kailangan ng agarang tulong, tumawag sa 911.');
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new Error('Mag-log in ulit para makita o ma-save ang report.');
  if (!response.ok || !data) throw new Error(data?.message || 'Hindi ma-process ang report. Subukan ulit.');
  return data;
}
