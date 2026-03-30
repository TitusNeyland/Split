/**
 * Subscription / profile fields for the dismissible price-change banner.
 *
 * Firestore shape (suggested):
 * - `subscriptions/{id}`: `priceChangedAt`, `priceChangeFromCents`, `priceChangeToCents`,
 *   optional `billingDayOfMonth` (1–28), and `amountCents` (current total).
 * - `users/{uid}`: `lastSeenPriceChangeBySubscription.{subscriptionId}` → Timestamp
 */
import { formatUsdFromCents } from '../format/currency';

export type SubscriptionPriceBannerFields = {
  priceChangedAt?: { toMillis: () => number } | null;
  /** Previous total before the change (cents). */
  priceChangeFromCents?: number | null;
  /** New total after the change (cents). */
  priceChangeToCents?: number | null;
  /** Day of month (1–28) for monthly billing; used to auto-dismiss after the next cycle. */
  billingDayOfMonth?: number | null;
};

export function formatCentsUsd(cents: number): string {
  return formatUsdFromCents(cents);
}

export function formatPriceChangeBannerMessage(fromCents: number, toCents: number): string {
  return `Price changed ${formatCentsUsd(fromCents)} → ${formatCentsUsd(toCents)} · effective next cycle`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function startOfBillingDay(year: number, monthIndex: number, dayOfMonth: number): Date {
  const d = Math.min(Math.max(1, dayOfMonth), 28);
  const dim = daysInMonth(year, monthIndex);
  const day = Math.min(d, dim);
  return new Date(year, monthIndex, day, 0, 0, 0, 0);
}

/** First billing-day midnight on or after `from` (monthly cadence). */
export function nextBillingOnOrAfter(from: Date, billingDayOfMonth: number): Date {
  const day = Math.min(Math.max(1, billingDayOfMonth), 28);
  let y = from.getFullYear();
  let m = from.getMonth();
  let candidate = startOfBillingDay(y, m, day);
  if (candidate.getTime() < from.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    candidate = startOfBillingDay(y, m, day);
  }
  return candidate;
}

/** Next monthly billing anchor after `anchor`. */
export function followingBillingAnchor(anchor: Date, billingDayOfMonth: number): Date {
  const day = Math.min(Math.max(1, billingDayOfMonth), 28);
  let y = anchor.getFullYear();
  let m = anchor.getMonth() + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  return startOfBillingDay(y, m, day);
}

/**
 * Hide the banner after the billing cycle that starts at the first post-change anchor has completed
 * (i.e. when we reach the following billing anchor).
 */
export function priceChangeBannerAutoDismissed(
  priceChangedAt: Date,
  billingDayOfMonth: number | null | undefined,
  now: Date = new Date()
): boolean {
  if (billingDayOfMonth == null || billingDayOfMonth < 1) {
    return false;
  }
  const b1 = nextBillingOnOrAfter(priceChangedAt, billingDayOfMonth);
  const dismissAt = followingBillingAnchor(b1, billingDayOfMonth);
  return now.getTime() >= dismissAt.getTime();
}

export function userLastSeenPriceChangeMs(
  map: Record<string, { toMillis?: () => number }> | null | undefined,
  subscriptionId: string
): number | null {
  const entry = map?.[subscriptionId];
  if (!entry) return null;
  const fn = entry.toMillis;
  if (typeof fn !== 'function') return null;
  const ms = fn.call(entry);
  return Number.isFinite(ms) ? ms : null;
}

export function timestampToMs(
  t: { toMillis: () => number } | Date | null | undefined
): number | null {
  if (t == null) return null;
  if (typeof (t as Date).getTime === 'function') {
    const ms = (t as Date).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const fn = (t as { toMillis?: () => number }).toMillis;
  if (typeof fn === 'function') {
    const ms = fn.call(t);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function shouldShowSubscriptionPriceBanner(
  sub: SubscriptionPriceBannerFields,
  userLastSeenPriceChangeMs: number | null,
  now: Date = new Date()
): boolean {
  const changedMs = timestampToMs(sub.priceChangedAt as { toMillis: () => number });
  const fromCents = sub.priceChangeFromCents;
  const toCents = sub.priceChangeToCents;
  if (
    changedMs == null ||
    fromCents == null ||
    toCents == null ||
    !Number.isFinite(fromCents) ||
    !Number.isFinite(toCents)
  ) {
    return false;
  }

  if (priceChangeBannerAutoDismissed(new Date(changedMs), sub.billingDayOfMonth ?? undefined, now)) {
    return false;
  }

  if (
    userLastSeenPriceChangeMs != null &&
    userLastSeenPriceChangeMs >= changedMs
  ) {
    return false;
  }

  return true;
}

function equalCentsSplit(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const rem = totalCents - n * base;
  const arr = Array(n).fill(base);
  for (let i = n - rem; i < n; i++) arr[i]++;
  return arr;
}

/** Equal-split range or single amount for the card subtitle (fair cents). */
export function perPersonAmountLabelEqualSplit(totalCents: number, memberCount: number): string {
  if (memberCount <= 0) return '$0.00/person';
  const arr = equalCentsSplit(totalCents, memberCount);
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (min === max) return `${formatCentsUsd(min)}/person`;
  return `${formatCentsUsd(min)}–${formatCentsUsd(max)}/person`;
}
