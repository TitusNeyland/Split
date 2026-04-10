import type { MemberSubscriptionDoc } from './memberSubscriptionsFirestore';
import {
  getMemberAmountCents,
  getMemberPlannedShareCents,
  getOwnerId,
  getTotalCents,
  normalizeSubscriptionStatus,
} from './subscriptionToCardModel';

/** Same merge order as subscriptionToCardModel `extractMemberPaymentStatus` / activity helpers. */
export function getMemberPaymentStatusNormalized(
  sub: Record<string, unknown>,
  memberUid: string
): string {
  const legacy = sub.memberPaymentStatus;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    const s = String((legacy as Record<string, string>)[memberUid] ?? '').toLowerCase();
    if (s) return s;
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

export function isActiveMemberForMetrics(sub: Record<string, unknown>, memberUid: string): boolean {
  const members = sub.members;
  if (Array.isArray(members) && members.length && typeof members[0] === 'object') {
    for (const m of members) {
      if (!m || typeof m !== 'object') continue;
      if ((m as { uid?: string }).uid !== memberUid) continue;
      return String((m as { memberStatus?: string }).memberStatus ?? '').toLowerCase() === 'active';
    }
    return false;
  }
  const st = getMemberPaymentStatusNormalized(sub, memberUid);
  return st !== '' && st !== 'invited_pending';
}

export function forEachNonOwnerMemberUid(
  sub: Record<string, unknown>,
  ownerUid: string,
  fn: (memberUid: string) => void
): void {
  const members = sub.members;
  if (Array.isArray(members) && members.length && typeof members[0] === 'object') {
    for (const m of members) {
      if (!m || typeof m !== 'object') continue;
      const mid = String((m as { uid?: string }).uid ?? '');
      if (!mid || mid === ownerUid) continue;
      fn(mid);
    }
    return;
  }
  const mps = sub.memberPaymentStatus as Record<string, string> | undefined;
  if (mps && typeof mps === 'object') {
    for (const mid of Object.keys(mps)) {
      if (!mid || mid === ownerUid) continue;
      const st = String(mps[mid] ?? '').toLowerCase();
      if (st === 'invited_pending') continue;
      fn(mid);
    }
  }
}

function isActiveSubscription(sub: Record<string, unknown>): boolean {
  return normalizeSubscriptionStatus(sub.status) === 'active';
}

/** Subscriptions where status is active; list is already scoped to viewer via SubscriptionsContext. */
export function computeYouOweCents(subs: MemberSubscriptionDoc[], viewerUid: string): number {
  if (!viewerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    if (getOwnerId(sub) === viewerUid) continue;
    const st = getMemberPaymentStatusNormalized(sub, viewerUid);
    if (st !== 'pending' && st !== 'overdue') continue;
    sum += getMemberAmountCents(sub, viewerUid);
  }
  return sum;
}

export function computeOwedToYouCents(subs: MemberSubscriptionDoc[], ownerUid: string): number {
  if (!ownerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    if (getOwnerId(sub) !== ownerUid) continue;
    forEachNonOwnerMemberUid(sub, ownerUid, (mid) => {
      if (!isActiveMemberForMetrics(sub, mid)) return;
      const st = getMemberPaymentStatusNormalized(sub, mid);
      if (st !== 'pending' && st !== 'overdue') return;
      sum += getMemberAmountCents(sub, mid);
    });
  }
  return sum;
}

export function computePendingOwedToOwnerCents(subs: MemberSubscriptionDoc[], ownerUid: string): number {
  if (!ownerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    if (getOwnerId(sub) !== ownerUid) continue;
    forEachNonOwnerMemberUid(sub, ownerUid, (mid) => {
      if (!isActiveMemberForMetrics(sub, mid)) return;
      const st = getMemberPaymentStatusNormalized(sub, mid);
      if (st !== 'pending') return;
      sum += getMemberAmountCents(sub, mid);
    });
  }
  return sum;
}

export function computeOverdueOwedToOwnerCents(subs: MemberSubscriptionDoc[], ownerUid: string): number {
  if (!ownerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    if (getOwnerId(sub) !== ownerUid) continue;
    forEachNonOwnerMemberUid(sub, ownerUid, (mid) => {
      if (!isActiveMemberForMetrics(sub, mid)) return;
      const st = getMemberPaymentStatusNormalized(sub, mid);
      if (st !== 'overdue') return;
      sum += getMemberAmountCents(sub, mid);
    });
  }
  return sum;
}

export function computeNetBalanceCents(subs: MemberSubscriptionDoc[], uid: string): number {
  return computeOwedToYouCents(subs, uid) - computeYouOweCents(subs, uid);
}

export function computeMonthlyTotalCents(subs: MemberSubscriptionDoc[]): number {
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    sum += getTotalCents(sub);
  }
  return sum;
}

/** Sum of each split's **planned** share for the viewer (roster math), not Option A collection rows. */
export function computeMyShareCents(subs: MemberSubscriptionDoc[], viewerUid: string): number {
  if (!viewerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    sum += getMemberPlannedShareCents(sub, viewerUid);
  }
  return sum;
}

/** Sum of (full subscription total − viewer share) for active splits where the viewer is a roster member. */
export function computeSavedBySplittingCents(subs: MemberSubscriptionDoc[], viewerUid: string): number {
  if (!viewerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    const members = sub.members;
    if (!Array.isArray(members) || !members.some((m) => m && typeof m === 'object' && (m as { uid?: string }).uid === viewerUid)) {
      continue;
    }
    const total = getTotalCents(sub);
    const myShare = getMemberPlannedShareCents(sub, viewerUid);
    sum += total - myShare;
  }
  return sum;
}

/** Sum of (full subscription total − viewer member amount) for active splits where the viewer is a member. */
export function computeSavedThisMonthCents(subs: MemberSubscriptionDoc[], viewerUid: string): number {
  if (!viewerUid) return 0;
  let sum = 0;
  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub)) continue;
    const members = sub.members;
    if (!Array.isArray(members) || !members.some((m) => m && typeof m === 'object' && (m as { uid?: string }).uid === viewerUid)) {
      continue;
    }
    const total = getTotalCents(sub);
    const myAmount = getMemberAmountCents(sub, viewerUid);
    sum += total - myAmount;
  }
  return sum;
}

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

function memberPaidAt(sub: Record<string, unknown>, memberUid: string): Date | null {
  const members = sub.members;
  if (!Array.isArray(members)) return null;
  for (const m of members) {
    if (m && typeof m === 'object' && (m as { uid?: string }).uid === memberUid) {
      const raw =
        (m as { paidAt?: unknown; paid_at?: unknown }).paidAt ?? (m as { paid_at?: unknown }).paid_at;
      return firestoreTimestampToDate(raw);
    }
  }
  return null;
}

/**
 * Collected this calendar month as owner: paid members with `paidAt` in the current month/year.
 */
export function computeCollectedThisMonthCents(
  subs: MemberSubscriptionDoc[],
  ownerUid: string,
  now = new Date()
): number {
  if (!ownerUid) return 0;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let sum = 0;

  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (getOwnerId(sub) !== ownerUid || !isActiveSubscription(sub)) continue;

    forEachNonOwnerMemberUid(sub, ownerUid, (mid) => {
      if (!isActiveMemberForMetrics(sub, mid)) return;
      const ps = getMemberPaymentStatusNormalized(sub, mid);
      if (ps !== 'paid') return;
      const paidAt = memberPaidAt(sub, mid);
      if (!paidAt) return;
      if (paidAt.getMonth() !== currentMonth || paidAt.getFullYear() !== currentYear) return;
      sum += getMemberAmountCents(sub, mid);
    });
  }

  return sum;
}

/** Counts non-owner active members still pending vs overdue (owner-only splits). */
export function computeOwnerPendingMemberCounts(
  subs: MemberSubscriptionDoc[],
  ownerUid: string
): { pendingOverdueCount: number; pendingOnlyCount: number } {
  let pendingOverdueCount = 0;
  let pendingOnlyCount = 0;
  if (!ownerUid) return { pendingOverdueCount: 0, pendingOnlyCount: 0 };

  for (const doc of subs) {
    const sub = doc as Record<string, unknown>;
    if (!isActiveSubscription(sub) || getOwnerId(sub) !== ownerUid) continue;
    forEachNonOwnerMemberUid(sub, ownerUid, (mid) => {
      if (!isActiveMemberForMetrics(sub, mid)) return;
      const st = getMemberPaymentStatusNormalized(sub, mid);
      if (st === 'overdue') pendingOverdueCount += 1;
      else if (st === 'pending') pendingOnlyCount += 1;
    });
  }
  return { pendingOverdueCount, pendingOnlyCount };
}
