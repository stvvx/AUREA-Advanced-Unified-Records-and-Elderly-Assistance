// Prefixes supplied by OSCA for the resident's barangay.
const BARANGAY_PREFIXES: [string, string][] = [['aguho', 'AG'], ['magtanggol', 'MG'], ['martires del 96', 'MD96'], ['martires del 1996', 'MD96'], ['martirez del 96', 'MD96'], ['poblacion', 'PB'], ['san pedro', 'SP'], ['san roque', 'SR'], ['santa ana', 'SA'], ['sta ana', 'SA'], ['st anne', 'SA'], ['santa anna', 'SA'], ['santo rosario kanluran', 'SRK'], ['sto rosario kanluran', 'SRK'], ['santo rosario silangan', 'SRS'], ['sto rosario silangan', 'SRS'], ['tabacalera', 'TB']];

export function formatSeniorId(profile?: { id?: number; address?: string | null; barangay?: string | null; oscaIdNumber?: string | null; osca_id_number?: string | null } | null): string {
  if (!profile) return '';
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const rawAddress = profile.barangay || profile.address || '';
  const barangay = rawAddress.match(/(?:^|[\s,])(?:brgy\.?|barangay|bgy\.?)\s+([^,]+)/i)?.[1];
  const address = ` ${normalize(barangay || rawAddress)} `;
  const prefix = BARANGAY_PREFIXES.find(([name]) => address.includes(` ${name} `))?.[1];
  const stored = (profile.oscaIdNumber || profile.osca_id_number || '').trim();
  const number = stored.match(/^[A-Z0-9]+-(\d+)$/i)?.[1] || (profile.id ? String(profile.id).padStart(4, '0') : '');
  return prefix && number ? `${prefix}-${number}` : stored;
}
