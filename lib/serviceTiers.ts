export type ServiceTierCycle = 'month' | 'year';

export type ServiceTier = {
  name: string;
  /** Price in dollars (e.g. 22.99). */
  price: number;
  cycle: ServiceTierCycle;
};

/**
 * Hardcoded tiers (fallback + offline). Prefer Firestore `service_tiers/{serviceName}` when available.
 */
export const SERVICE_TIERS_STATIC: Record<string, ServiceTier[]> = {
  Netflix: [
    { name: 'Standard with ads', price: 6.99, cycle: 'month' },
    { name: 'Standard', price: 15.49, cycle: 'month' },
    { name: 'Premium', price: 22.99, cycle: 'month' },
  ],
  Hulu: [
    { name: 'With ads', price: 7.99, cycle: 'month' },
    { name: 'No ads', price: 17.99, cycle: 'month' },
    { name: 'Live TV + ads', price: 82.99, cycle: 'month' },
    { name: 'Live TV no ads', price: 95.99, cycle: 'month' },
  ],
  Spotify: [
    { name: 'Individual', price: 11.99, cycle: 'month' },
    { name: 'Duo', price: 16.99, cycle: 'month' },
    { name: 'Family', price: 19.99, cycle: 'month' },
    { name: 'Student', price: 5.99, cycle: 'month' },
  ],
  'Disney+': [
    { name: 'Basic (with ads)', price: 7.99, cycle: 'month' },
    { name: 'Premium', price: 13.99, cycle: 'month' },
  ],
  'Xbox Game Pass': [
    { name: 'Core', price: 9.99, cycle: 'month' },
    { name: 'Standard', price: 14.99, cycle: 'month' },
    { name: 'Ultimate', price: 19.99, cycle: 'month' },
  ],
  iCloud: [
    { name: '50GB', price: 0.99, cycle: 'month' },
    { name: '200GB', price: 2.99, cycle: 'month' },
    { name: '2TB', price: 9.99, cycle: 'month' },
    { name: '6TB', price: 29.99, cycle: 'month' },
    { name: '12TB', price: 59.99, cycle: 'month' },
  ],
};

function tiersForKeyExact(key: string): ServiceTier[] {
  const list = SERVICE_TIERS_STATIC[key];
  return list ? [...list] : [];
}

/** Case-insensitive exact key match. */
export function getStaticTiersForService(serviceName: string): ServiceTier[] {
  const trimmed = serviceName.trim();
  if (!trimmed) return [];
  const direct = tiersForKeyExact(trimmed);
  if (direct.length) return direct;
  const lower = trimmed.toLowerCase();
  for (const k of Object.keys(SERVICE_TIERS_STATIC)) {
    if (k.toLowerCase() === lower) return [...SERVICE_TIERS_STATIC[k]!];
  }
  return [];
}

/**
 * Resolve which static/Firestore doc key to use (e.g. "Netflix Premium" → Netflix tiers).
 */
export function resolveServiceTierLookupKey(serviceName: string): string {
  const trimmed = serviceName.trim();
  if (!trimmed) return trimmed;
  if (getStaticTiersForService(trimmed).length) return trimmed;
  const premiumSuffix = / premium$/i;
  if (premiumSuffix.test(trimmed)) {
    const base = trimmed.replace(premiumSuffix, '').trim();
    if (getStaticTiersForService(base).length) return base;
  }
  return trimmed;
}

export function tierPriceLabel(tier: ServiceTier): string {
  const period = tier.cycle === 'year' ? 'year' : 'month';
  return `$${tier.price.toFixed(2)} / ${period}`;
}

export function parseFirestoreTiers(raw: unknown): ServiceTier[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ServiceTier[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const name = typeof (row as { name?: unknown }).name === 'string' ? (row as { name: string }).name.trim() : '';
    const priceRaw = (row as { price?: unknown }).price;
    const price =
      typeof priceRaw === 'number' && Number.isFinite(priceRaw)
        ? priceRaw
        : typeof priceRaw === 'string'
          ? parseFloat(priceRaw)
          : NaN;
    const cycleRaw = (row as { cycle?: unknown }).cycle;
    const cycle =
      cycleRaw === 'year' || cycleRaw === 'yearly' ? 'year' : cycleRaw === 'month' || cycleRaw === 'monthly' ? 'month' : null;
    if (!name || !Number.isFinite(price) || price < 0 || !cycle) continue;
    out.push({ name, price, cycle });
  }
  return out.length ? out : null;
}
