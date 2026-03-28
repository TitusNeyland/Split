import Constants from 'expo-constants';

export function getStripeApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.receiptApiUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.replace(/\/$/, '');
  const env = process.env.EXPO_PUBLIC_RECEIPT_API_URL;
  if (typeof env === 'string' && env.trim()) return env.replace(/\/$/, '');
  return 'http://localhost:8787';
}

export type StripeFetchOptions = {
  /** For server `STRIPE_DEV_BYPASS=1`: must match the signed-in Firebase uid. */
  firebaseUidHeader?: string;
};

async function stripeFetch<T>(
  path: string,
  idToken: string,
  init: RequestInit,
  opts?: StripeFetchOptions
): Promise<T> {
  const base = getStripeApiBaseUrl();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    ...(opts?.firebaseUidHeader ? { 'x-firebase-uid': opts.firebaseUidHeader } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  if (!headers['Content-Type'] && init.method && init.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export async function stripeCreateCustomer(
  idToken: string,
  fetchOpts?: StripeFetchOptions
): Promise<{ customerId: string }> {
  return stripeFetch(
    '/api/stripe/customer',
    idToken,
    { method: 'POST', body: '{}' },
    fetchOpts
  );
}

export async function stripeListPaymentMethods(
  idToken: string,
  customerId: string,
  fetchOpts?: StripeFetchOptions
): Promise<{
  paymentMethods: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  }[];
}> {
  const q = new URLSearchParams({ customerId }).toString();
  return stripeFetch(`/api/stripe/payment-methods?${q}`, idToken, { method: 'GET' }, fetchOpts);
}

export async function stripeCreateSetupIntent(
  idToken: string,
  customerId: string,
  fetchOpts?: StripeFetchOptions
): Promise<{
  customerId: string;
  customerEphemeralKeySecret: string;
  setupIntentClientSecret: string;
}> {
  return stripeFetch(
    '/api/stripe/setup-intent',
    idToken,
    { method: 'POST', body: JSON.stringify({ customerId }) },
    fetchOpts
  );
}

export async function stripeSetDefaultPaymentMethod(
  idToken: string,
  customerId: string,
  paymentMethodId: string,
  fetchOpts?: StripeFetchOptions
): Promise<{ ok: boolean }> {
  return stripeFetch(
    '/api/stripe/set-default-payment-method',
    idToken,
    { method: 'POST', body: JSON.stringify({ customerId, paymentMethodId }) },
    fetchOpts
  );
}

export async function stripeDetachPaymentMethod(
  idToken: string,
  customerId: string,
  paymentMethodId: string,
  fetchOpts?: StripeFetchOptions
): Promise<{ ok: boolean }> {
  return stripeFetch(
    '/api/stripe/detach-payment-method',
    idToken,
    { method: 'POST', body: JSON.stringify({ customerId, paymentMethodId }) },
    fetchOpts
  );
}
