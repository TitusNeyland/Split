import { ordinalDay, getNextFirstChargeDate } from './billingDayFormat';
import { parseFirestoreBillingCycle, subscriptionDisplayName } from './billingCalendarModel';
import { getTotalCents } from './subscriptionToCardModel';
import type { MemberSubscriptionDoc } from './memberSubscriptionsFirestore';

export const SORT_STORAGE_KEY = 'subs_sort_preference';

export const SORT_OPTIONS = [
  { id: 'due_asc', label: 'Due date (soonest first)' },
  { id: 'due_desc', label: 'Due date (latest first)' },
  { id: 'name_asc', label: 'Name A–Z' },
  { id: 'name_desc', label: 'Name Z–A' },
  { id: 'created_desc', label: 'Date created (newest)' },
  { id: 'created_asc', label: 'Date created (oldest)' },
  { id: 'amount_desc', label: 'Amount (high to low)' },
  { id: 'amount_asc', label: 'Amount (low to high)' },
  { id: 'status', label: 'Status (overdue first)' },
] as const;

export type SubscriptionSortId = (typeof SORT_OPTIONS)[number]['id'];

export const DEFAULT_SUBSCRIPTION_SORT_ID: SubscriptionSortId = 'due_asc';

const SORT_IDS = new Set<string>(SORT_OPTIONS.map((o) => o.id));

export function isSubscriptionSortId(raw: string | null | undefined): raw is SubscriptionSortId {
  return raw != null && SORT_IDS.has(raw);
}

function effectiveBillingDayLabel(data: Record<string, unknown>): string {
  const existing = data.billingDayLabel;
  if (typeof existing === 'string' && existing.trim()) return existing.trim();
  const bd = data.billingDay;
  if (typeof bd === 'number' && bd >= 1 && bd <= 31) {
    return `Every ${ordinalDay(bd)}`;
  }
  return '';
}

/** UTC ms for next billing calendar day; sorts unknown dates last. */
export function getNextBillingTimestampMs(sub: Record<string, unknown>): number {
  const cycle = parseFirestoreBillingCycle(sub.billingCycle);
  const label = effectiveBillingDayLabel(sub);
  if (!label) return Number.MAX_SAFE_INTEGER;
  const next = getNextFirstChargeDate(cycle, label);
  if (!next) return Number.MAX_SAFE_INTEGER;
  const d = new Date(next);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getCreatedAtSeconds(sub: Record<string, unknown>): number {
  const c = sub.createdAt as { seconds?: number; _seconds?: number; toMillis?: () => number } | undefined;
  if (c && typeof c === 'object') {
    if (typeof c.seconds === 'number' && Number.isFinite(c.seconds)) return c.seconds;
    if (typeof c._seconds === 'number' && Number.isFinite(c._seconds)) return c._seconds;
    if (typeof c.toMillis === 'function') {
      const ms = c.toMillis();
      if (typeof ms === 'number' && Number.isFinite(ms)) return Math.floor(ms / 1000);
    }
  }
  return 0;
}

function displayNameForSort(sub: Record<string, unknown>): string {
  const serviceName = typeof sub.serviceName === 'string' ? sub.serviceName : '';
  const planName = typeof sub.planName === 'string' ? sub.planName : undefined;
  return subscriptionDisplayName(serviceName, planName);
}

/**
 * Overdue first, then pending, then paid / owner / other.
 * Uses `memberPaymentStatus` map and `members[].paymentStatus` when present.
 */
export function getStatusPriority(sub: Record<string, unknown>): number {
  const statuses: string[] = [];
  const legacy = sub.memberPaymentStatus;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    for (const v of Object.values(legacy as Record<string, string>)) {
      statuses.push(String(v).toLowerCase());
    }
  }
  const members = sub.members;
  if (Array.isArray(members)) {
    for (const m of members) {
      if (m && typeof m === 'object') {
        const ps = (m as { paymentStatus?: string }).paymentStatus;
        if (ps) statuses.push(String(ps).toLowerCase());
      }
    }
  }
  const hasOverdue = statuses.some((s) => s === 'overdue');
  const hasPending = statuses.some((s) => s === 'pending');
  if (hasOverdue) return 0;
  if (hasPending) return 1;
  return 2;
}

export function sortMemberSubscriptions(
  subs: MemberSubscriptionDoc[],
  sortId: SubscriptionSortId
): MemberSubscriptionDoc[] {
  return [...subs].sort((a, b) => {
    const da = a as Record<string, unknown>;
    const db = b as Record<string, unknown>;
    switch (sortId) {
      case 'name_asc':
        return displayNameForSort(da).localeCompare(displayNameForSort(db));
      case 'name_desc':
        return displayNameForSort(db).localeCompare(displayNameForSort(da));
      case 'created_desc':
        return getCreatedAtSeconds(db) - getCreatedAtSeconds(da);
      case 'created_asc':
        return getCreatedAtSeconds(da) - getCreatedAtSeconds(db);
      case 'due_asc':
        return getNextBillingTimestampMs(da) - getNextBillingTimestampMs(db);
      case 'due_desc':
        return getNextBillingTimestampMs(db) - getNextBillingTimestampMs(da);
      case 'amount_desc':
        return getTotalCents(db) - getTotalCents(da);
      case 'amount_asc':
        return getTotalCents(da) - getTotalCents(db);
      case 'status':
        return getStatusPriority(da) - getStatusPriority(db);
      default:
        return getNextBillingTimestampMs(da) - getNextBillingTimestampMs(db);
    }
  });
}

export function subscriptionSortButtonLabel(activeSortId: SubscriptionSortId): string {
  if (activeSortId === DEFAULT_SUBSCRIPTION_SORT_ID) return 'Sort';
  return SORT_OPTIONS.find((o) => o.id === activeSortId)?.label ?? 'Sort';
}
