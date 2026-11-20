import { API_BASE_URL } from './loloApi';

export type HealthCenter = { id: string; name: string; area: string };
export type Appointment = {
  id: string;
  center_id: string;
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  scheduled_at: string | null;
  review_note: string | null;
  name?: string;
  details?: Record<string, string>;
};

export const appointmentStatus = {
  Pending: 'Naghihintay ng schedule',
  Confirmed: 'Confirmed na ang appointment',
  Completed: 'Tapos na ang appointment',
  Cancelled: 'Na-cancel ang appointment',
};

export function appointmentTime(value: string) {
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' });
}

export async function checkupRequest<T>(token: string, path = '', method = 'GET', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/checkup-appointments${path}`, {
    method, signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new Error('Mag-log in ulit para magpatuloy.');
  if (!response.ok || !data) throw new Error(data?.message || 'Hindi ma-process ang check-up request. Subukan ulit.');
  return data;
}
