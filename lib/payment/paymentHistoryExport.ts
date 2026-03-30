import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import { formatUsdDollarsFixed2 } from '../format/currency';

export type PaymentHistoryEvent = {
  at: Date;
  subscription: string;
  amount: number;
  status: string;
  method: string;
  notes: string;
};

/** Replace with a Firestore query when payment events are stored server-side. */
export function getPaymentHistoryForExport(): PaymentHistoryEvent[] {
  return [...MOCK_PAYMENT_EVENTS].sort((a, b) => b.at.getTime() - a.at.getTime());
}

const MOCK_PAYMENT_EVENTS: PaymentHistoryEvent[] = [
  {
    at: new Date('2025-03-18T14:22:00Z'),
    subscription: 'Netflix Premium',
    amount: 22.99,
    status: 'Completed',
    method: 'Visa •••• 4242',
    notes: 'March cycle',
  },
  {
    at: new Date('2025-03-15T09:05:00Z'),
    subscription: 'Spotify Family',
    amount: 16.99,
    status: 'Completed',
    method: 'Apple Pay',
    notes: 'Your share collected',
  },
  {
    at: new Date('2025-03-10T18:40:00Z'),
    subscription: 'iCloud+ 200GB',
    amount: 2.99,
    status: 'Pending',
    method: 'Bank transfer',
    notes: 'Awaiting confirmation',
  },
  {
    at: new Date('2025-02-22T11:30:00Z'),
    subscription: 'Spotify Family',
    amount: 16.99,
    status: 'Completed',
    method: 'Visa •••• 4242',
    notes: '',
  },
  {
    at: new Date('2025-02-18T08:00:00Z'),
    subscription: 'Netflix Premium',
    amount: 22.99,
    status: 'Failed',
    method: 'Visa •••• 4242',
    notes: 'Card declined — retried next day',
  },
  {
    at: new Date('2025-02-18T15:12:00Z'),
    subscription: 'Netflix Premium',
    amount: 22.99,
    status: 'Completed',
    method: 'Visa •••• 4242',
    notes: 'Retry succeeded',
  },
];

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function formatTimestampCsv(d: Date): string {
  return d.toISOString();
}

export function buildPaymentHistoryCsv(events: PaymentHistoryEvent[]): string {
  const header = [
    'timestamp',
    'subscription',
    'amount',
    'status',
    'method',
    'notes',
  ].join(',');
  const rows = events.map((e) =>
    [
      escapeCsvCell(formatTimestampCsv(e.at)),
      escapeCsvCell(e.subscription),
      escapeCsvCell(e.amount.toFixed(2)),
      escapeCsvCell(e.status),
      escapeCsvCell(e.method),
      escapeCsvCell(e.notes),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function monthSortKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthHeading(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function buildPaymentHistoryPdfHtml(
  events: PaymentHistoryEvent[],
  opts?: { userLabel?: string }
): string {
  const sorted = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());
  const byMonth = new Map<string, PaymentHistoryEvent[]>();
  for (const e of sorted) {
    const key = monthSortKey(e.at);
    const list = byMonth.get(key);
    if (list) list.push(e);
    else byMonth.set(key, [e]);
  }
  const keys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const userLine = opts?.userLabel
    ? `<p style="color:#666;font-size:12px;margin:4px 0 16px;">${escapeHtml(opts.userLabel)}</p>`
    : '';

  const sections = keys
    .map((key) => {
      const list = byMonth.get(key)!;
      const sample = list[0]!;
      const title = monthHeading(sample.at);
      const rows = list
        .map((e) => {
          const when = e.at.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          return `<tr>
            <td>${escapeHtml(when)}</td>
            <td>${escapeHtml(e.subscription)}</td>
            <td style="text-align:right;">${formatUsdDollarsFixed2(e.amount)}</td>
            <td>${escapeHtml(e.status)}</td>
            <td>${escapeHtml(e.method)}</td>
            <td>${escapeHtml(e.notes || '—')}</td>
          </tr>`;
        })
        .join('');
      return `<h2>${escapeHtml(title)}</h2>
        <table>
          <thead><tr>
            <th>When</th><th>Subscription</th><th style="text-align:right;">Amount</th>
            <th>Status</th><th>Method</th><th>Notes</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join('');

  const generated = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 28px; color: #1a1a18; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #ddd; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
    th { color: #555; font-weight: 600; }
    .meta { color: #888; font-size: 11px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Payment history</h1>
  ${userLine}
  ${sections || '<p>No payment events.</p>'}
  <p class="meta">Generated ${escapeHtml(generated)}</p>
</body>
</html>`;
}

async function ensureSharing(): Promise<boolean> {
  const ok = await Sharing.isAvailableAsync();
  if (!ok) {
    Alert.alert(
      'Sharing unavailable',
      Platform.OS === 'web'
        ? 'Use the native app to share exported files.'
        : 'Sharing is not available on this device.'
    );
  }
  return ok;
}

export async function sharePaymentHistoryCsv(events: PaymentHistoryEvent[]): Promise<void> {
  const csv = buildPaymentHistoryCsv(events);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  const base = FileSystem.cacheDirectory ?? '';
  if (!base) {
    Alert.alert('Export failed', 'File storage is not available.');
    return;
  }
  const path = `${base}payment-history-${Date.now()}.csv`;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!(await ensureSharing())) return;
  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: 'Payment history (CSV)',
    UTI: 'public.comma-separated-values-text',
  });
}

export async function sharePaymentHistoryPdf(
  events: PaymentHistoryEvent[],
  opts?: { userLabel?: string }
): Promise<void> {
  const html = buildPaymentHistoryPdfHtml(events, opts);

  if (Platform.OS === 'web') {
    Alert.alert(
      'Save as PDF',
      'Your browser will open the print dialog. Choose “Save as PDF” (or “Microsoft Print to PDF”) to download the report.'
    );
    await Print.printAsync({ html });
    return;
  }

  const result = await Print.printToFileAsync({ html });
  if (!result?.uri) {
    Alert.alert('Export failed', 'Could not create the PDF file.');
    return;
  }
  if (!(await ensureSharing())) return;
  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Payment history (PDF)',
    UTI: 'com.adobe.pdf',
  });
}
