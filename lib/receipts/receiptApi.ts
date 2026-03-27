import Constants from 'expo-constants';
import type { ParseReceiptResponse } from './receiptTypes';

function getBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_RECEIPT_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra as { receiptApiUrl?: string } | undefined;
  if (extra?.receiptApiUrl) return String(extra.receiptApiUrl).replace(/\/$/, '');
  return 'http://localhost:8787';
}

/**
 * Upload a local image URI (file://) to the receipt parse API.
 */
export async function parseReceiptImage(
  uri: string,
  mimeType: string = 'image/jpeg'
): Promise<ParseReceiptResponse> {
  const base = getBaseUrl();
  const form = new FormData();
  // React Native file descriptor (not a web Blob)
  form.append('image', { uri, name: 'receipt.jpg', type: mimeType } as unknown as Blob);

  const res = await fetch(`${base}/api/receipt/parse`, {
    method: 'POST',
    body: form,
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid response from receipt server (${res.status})`);
  }

  if (!res.ok) {
    const err = body as { error?: string; detail?: string };
    throw new Error(err.error || err.detail || `Request failed (${res.status})`);
  }

  return body as ParseReceiptResponse;
}
