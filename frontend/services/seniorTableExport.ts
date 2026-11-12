import { Platform } from 'react-native';
import { API_BASE_URL } from './loloApi';

export type ExportCell = {
  text: string;
  value?: string | number | null;
  kind?: 'date' | 'datetime' | 'currency';
  hyperlink?: string;
};
export type SeniorExportTable = {
  service?: string;
  columns: { key: string; label: string }[];
  rows: ExportCell[][];
};

export async function downloadSeniorTable(table: SeniorExportTable, format: 'pdf' | 'xlsx', token: string, report: 'senior-citizens' | 'service-records' = 'senior-citizens'): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/admin/seniors/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...table, format, report }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not download the table. Please try again.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const serviceSuffix = table.service ? `-${table.service.toLowerCase().replace(/ /g, '-')}` : '';
  const filename = `${report}${serviceSuffix}-${date}.${format}`;
  const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  const file = new File(Paths.cache, filename);
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: `Save ${format === 'pdf' ? 'PDF' : 'Excel'} table` });
}
