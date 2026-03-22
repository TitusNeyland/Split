import { getStripeApiBaseUrl } from './stripeApi';

/** Server deletes the session doc and sends silent FCM with data.type = SESSION_REVOKED. */
export async function revokeSessionViaApi(idToken: string, sessionId: string): Promise<boolean> {
  const base = getStripeApiBaseUrl();
  try {
    const res = await fetch(`${base}/api/sessions/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
