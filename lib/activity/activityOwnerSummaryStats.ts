import type { MemberSubscriptionDoc } from '../subscription/memberSubscriptionsFirestore';
import {
  getOwnerId,
  getViewerShareCents,
  normalizeSubscriptionStatus,
} from '../subscription/subscriptionToCardModel';

function firestoreTimestampToDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'toDate' in raw &&
    typeof (raw as { toDate?: () => Date }).toDate === 'function'
  ) {
    const d = (raw as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const s = (raw as { seconds: number }).seconds;
    if (typeof s === 'number' && Number.isFinite(s)) return new Date(s * 1000);
  }
  return null;
}

/** Matches {@link subscriptionToCardModel} `extractMemberPaymentStatus` priority. */
function paymentStatusForUid(sub: Record<string, unknown>, memberUid: string): string {
  const legacy = sub.memberPaymentStatus;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    return String((legacy as Record<string, string>)[memberUid] ?? '').toLowerCase();
  }
  const members = sub.members;
  if (Array.isArray(members)) {
    for (const m of members) {
      if (m && typeof m === 'object' && (m as { uid?: string }).uid === memberUid) {
        return String((m as { paymentStatus?: string }).paymentStatus ?? '').toLowerCase();
      }
    }
  }
  return '';
}

function memberPaidAt(sub: Record<string, unknown>, memberUid: string): Date | null {
  const members = sub.members;
  if (!Array.isArray(members)) return null;
  for (const m of members) {
    if (m && typeof m === 'object' && (m as { uid?: string }).uid === memberUid) {
      const raw =
        (m as { paidAt?: unknown; paid_at?: unknown }).paidAt ??
        (m as { paid_at?: unknown }).paid_at;
      return firestoreTimestampToDate(raw);
    }
  }
  return null;
}

function startEndOfCalendarMonth(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function isDateInRange(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

/**
 * Collected this month + pending owed to the viewer as split owner, from in-memory subscription docs
 * (same source as SubscriptionsContext).
 */
export function computeActivityOwnerSummaryStats(
  subscriptions: MemberSubscriptionDoc[],
  uid: string,
  now = new Date()
): {
  collectedThisMonthCents: number;
  pendingCents: number;
  pendingOverdueCount: number;
  pendingOnlyCount: number;
} {
  if (!uid) {
    return {
      collectedThisMonthCents: 0,
      pendingCents: 0,
      pendingOverdueCount: 0,
      pendingOnlyCount: 0,
    };
  }

  const { start, end } = startEndOfCalendarMonth(now);
  let collectedThisMonthCents = 0;
  let pendingCents = 0;
  let pendingOverdueCount = 0;
  let pendingOnlyCount = 0;

  for (const doc of subscriptions) {
    const sub = doc as Record<string, unknown>;
    if (getOwnerId(sub) !== uid) continue;

    const members = sub.members;
    if (!Array.isArray(members)) continue;

    for (const m of members) {
      if (!m || typeof m !== 'object') continue;
      const memberUid = (m as { uid?: string }).uid;
      if (!memberUid || memberUid === uid) continue;

      const roster = String((m as { memberStatus?: string }).memberStatus ?? '').toLowerCase();
      if (roster !== 'active') continue;

      const ps = paymentStatusForUid(sub, memberUid);
      const rosterPs = String((m as { paymentStatus?: string }).paymentStatus ?? '').toLowerCase();
      const effectivePs = ps || rosterPs;

      const amount = getViewerShareCents(sub, memberUid);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      if (effectivePs === 'paid') {
        const paidAt = memberPaidAt(sub, memberUid);
        if (paidAt && isDateInRange(paidAt, start, end)) {
          collectedThisMonthCents += amount;
        }
        continue;
      }

      if (effectivePs === 'pending' || effectivePs === 'overdue') {
        if (normalizeSubscriptionStatus(sub.status) !== 'active') continue;
        pendingCents += amount;
        if (effectivePs === 'overdue') pendingOverdueCount += 1;
        else pendingOnlyCount += 1;
      }
    }
  }

  return {
    collectedThisMonthCents,
    pendingCents,
    pendingOverdueCount,
    pendingOnlyCount,
  };
}
