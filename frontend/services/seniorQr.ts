import { API_BASE_URL } from './loloApi';

type Benefit = { user_id: number; benefit_type?: string; benefit_status?: string; validation_status?: string };
type Reservation = { user_id: number; status?: string; movie_title?: string; screening_date?: string };
export type ServiceSnapshot = { userId: number; lines: string[]; checkedAt: string };

export function pendingServiceLines(benefits: Benefit[] | null, movies: Reservation[] | null, userId: number, today: string): string[] {
  const lines: string[] = [];
  if (benefits === null) lines.push('Birthday benefits: status unavailable');
  else {
    const pending = benefits.filter(row => row.user_id === userId
      && ['Pending', 'For Processing', 'Approved'].includes(row.benefit_status || 'Pending')
      && !['Rejected', 'Ineligible'].includes(row.validation_status || ''));
    lines.push(...pending.map(row => `Birthday benefit (${row.benefit_type || 'Application'}): ${row.benefit_status || 'Pending'}${row.validation_status ? ` / ${row.validation_status}` : ''}`));
    if (!pending.length) lines.push('Birthday benefits: none pending');
  }
  if (movies === null) lines.push('Movie reservations: status unavailable');
  else {
    const pending = movies.filter(row => row.user_id === userId
      && ['Pending', 'Confirmed'].includes(row.status || '')
      && (!row.screening_date || row.screening_date.slice(0, 10) >= today));
    lines.push(...pending.map(row => `Movie reservation: ${row.status}${row.movie_title ? ` - ${row.movie_title.slice(0, 60)}` : ''}${row.screening_date ? ` (${row.screening_date.slice(0, 10)})` : ''}`));
    if (!pending.length) lines.push('Movie reservations: none pending');
  }
  // Keep the QR readable even for accounts with many open applications.
  return lines.length > 6 ? [...lines.slice(0, 5), `${lines.length - 5} more records; check AUREA for details`] : lines;
}

export async function loadServiceSnapshot(userId: number, signal: AbortSignal): Promise<ServiceSnapshot> {
  const load = async (path: string, key: string) => {
    const response = await fetch(`${API_BASE_URL}${path}`, { signal });
    if (!response.ok) throw new Error('Service status unavailable');
    const data = await response.json();
    if (data.success === false || !Array.isArray(data[key])) throw new Error('Invalid service response');
    return data[key];
  };
  const [benefits, movies] = await Promise.allSettled([
    load(`/api/benefit-applications/user/${userId}`, 'applications'),
    load(`/api/movie-center/reservations?user_id=${userId}`, 'reservations'),
  ]);
  const now = new Date();
  return {
    userId,
    lines: pendingServiceLines(benefits.status === 'fulfilled' ? benefits.value : null,
      movies.status === 'fulfilled' ? movies.value : null, userId,
      now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })),
    checkedAt: now.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
  };
}
