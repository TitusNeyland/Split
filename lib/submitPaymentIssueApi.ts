import { getStripeApiBaseUrl } from './stripeApi';

export type PaymentIssuePayload = {
  subscription: string;
  issueType: string;
  description: string;
};

export async function submitPaymentIssueViaApi(
  idToken: string,
  body: PaymentIssuePayload
): Promise<void> {
  const base = getStripeApiBaseUrl();
  const res = await fetch(`${base}/api/support/payment-issue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
}
