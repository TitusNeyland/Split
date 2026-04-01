/**
 * Home hero + sections derived from subscription docs (wizard / Firestore shape).
 * Amounts in dollars for chart UI; cents helpers where noted.
 */
import { parseFirestoreBillingCycle } from '../subscription/billingCalendarModel';
import { getNextFirstChargeDate, ordinalDay } from '../subscription/billingDayFormat';
import { getMemberAmountCents } from '../subscription/memberAmount';
import {
  getTotalCents,
  getOwnerId,
  isViewerAcceptedActiveMember,
  normalizeSubscriptionStatus,
} from '../subscription/subscriptionToCardModel';
import {
  computeOwedToYouCents,
  computeOverdueOwedToOwnerCents,
  computeYouOweCents,
  getMemberPaymentStatusNormalized,
} from '../subscription/subscriptionDerivedMetrics';
import type { MemberSubscriptionDoc } from '../subscription/memberSubscriptionsFirestore';
import { subscriptionDisplayName } from '../subscription/billingCalendarModel';
import { formatUsdDollarsFixed2 } from '../format/currency';
import type { HomeCalendarBill } from './homeWeekCalendar';

export type RawSub = MemberSubscriptionDoc;

/** Home chart / balances: only splits where the viewer has accepted membership. */
function subsAcceptedForViewer(subs: RawSub[], viewerUid: string): RawSub[] {
  return subs.filter((s) => isViewerAcceptedActiveMember(s, viewerUid));
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function effectiveBillingLabel(sub: Record<string, unknown>): string {
  const existing = sub.billingDayLabel;
  if (typeof existing === 'string' && existing.trim()) return existing.trim();
  const bd = sub.billingDay;
  if (typeof bd === 'number' && bd >= 1 && bd <= 31) {
    return `Every ${ordinalDay(bd)}`;
  }
  return '';
}

export function getMemberShareCents(sub: Record<string, unknown>, memberUid: string): number {
  return getMemberAmountCents(sub, memberUid);
}

export function getMemberPaymentStatusRaw(sub: Record<string, unknown>, memberUid: string): string {
  return getMemberPaymentStatusNormalized(sub, memberUid);
}

/** Money owed for the current cycle (home hero + float card) — excludes invite placeholders. */
function isCycleDebt(st: string): boolean {
  return st === 'pending' || st === 'overdue';
}

export function isActiveLike(sub: Record<string, unknown>): boolean {
  return normalizeSubscriptionStatus(sub.status) === 'active';
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/** Days until next billing (0 = today, 1 = tomorrow). Large if unknown. */
export function getDaysUntilBillingFromSub(sub: Record<string, unknown>): number {
  const cycle = parseFirestoreBillingCycle(sub.billingCycle);
  const label = effectiveBillingLabel(sub);
  if (!label) return 9999;
  const next = getNextFirstChargeDate(cycle, label);
  if (!next) return 9999;
  const t0 = startOfLocalDay(new Date()).getTime();
  const t1 = startOfLocalDay(next).getTime();
  return Math.ceil((t1 - t0) / 86400000);
}

export type HomeFinancialFromSubs = {
  youOwe: number;
  owedToYou: number;
  overdue: number;
};

export function computeHomeFinancialFromSubscriptions(
  subs: RawSub[],
  uid: string
): HomeFinancialFromSubs {
  const chartSubs = subsAcceptedForViewer(subs, uid);
  return {
    youOwe: centsToDollars(computeYouOweCents(chartSubs, uid)),
    owedToYou: centsToDollars(computeOwedToYouCents(chartSubs, uid)),
    overdue: centsToDollars(computeOverdueOwedToOwnerCents(chartSubs, uid)),
  };
}

export type FloatRowYouOwe = {
  kind: 'you_owe';
  subscriptionId: string;
  name: string;
  serviceName: string;
  amountDollars: number;
  daysUntil: number;
};

export type FloatRowPending = {
  kind: 'pending_collect';
  pendingCount: number;
  totalDollars: number;
};

export type FloatRowOverdue = {
  kind: 'overdue_collect';
  subscriptionId: string;
  name: string;
  serviceName: string;
  memberUid: string;
  amountDollars: number;
  daysOverdueApprox: number;
};

export type HomeFloatCardModel = {
  youOweRow: FloatRowYouOwe | null;
  pendingRow: FloatRowPending | null;
  overdueRow: FloatRowOverdue | null;
};

export function subscriptionNextBillingDate(sub: Record<string, unknown>): Date | null {
  const cycle = parseFirestoreBillingCycle(sub.billingCycle);
  const label = effectiveBillingLabel(sub);
  if (!label) return null;
  return getNextFirstChargeDate(cycle, label);
}

export function subscriptionsToHomeCalendarBills(subs: RawSub[], viewerUid: string): HomeCalendarBill[] {
  const chartSubs = subsAcceptedForViewer(subs, viewerUid);
  const out: HomeCalendarBill[] = [];
  for (const sub of chartSubs) {
    if (normalizeSubscriptionStatus(sub.status) !== 'active') continue;
    const d = subscriptionNextBillingDate(sub);
    if (!d) continue;
    const sn = typeof sub.serviceName === 'string' ? sub.serviceName : '';
    const pn = typeof sub.planName === 'string' ? sub.planName : undefined;
    const name = subscriptionDisplayName(sn, pn);
    out.push({
      id: sub.id,
      serviceName: name,
      billingDate: d,
      amount: centsToDollars(getTotalCents(sub)),
    });
  }
  return out;
}

function displayName(sub: Record<string, unknown>): string {
  const sn = typeof sub.serviceName === 'string' ? sub.serviceName.trim() : '';
  const pn = typeof sub.planName === 'string' ? sub.planName.trim() : '';
  if (pn && sn && !sn.toLowerCase().includes(pn.toLowerCase())) return `${sn} ${pn}`.trim();
  return sn || pn || 'Subscription';
}

function serviceNameForIcon(sub: Record<string, unknown>): string {
  const sn = typeof sub.serviceName === 'string' ? sub.serviceName.trim() : '';
  if (sn) return sn;
  const sid = typeof sub.serviceId === 'string' ? sub.serviceId.trim() : '';
  return sid ? sid.charAt(0).toUpperCase() + sid.slice(1) : 'Subscription';
}

export function computeHomeFloatCard(subs: RawSub[], uid: string): HomeFloatCardModel {
  const active = subsAcceptedForViewer(subs, uid).filter((s) => isActiveLike(s));

  const youOweCandidates: FloatRowYouOwe[] = [];
  for (const sub of active) {
    const owner = getOwnerId(sub);
    if (owner === uid) continue;
    const st = getMemberPaymentStatusRaw(sub, uid);
    if (!isCycleDebt(st)) continue;
    const amt = getMemberShareCents(sub, uid);
    if (amt <= 0) continue;
    youOweCandidates.push({
      kind: 'you_owe',
      subscriptionId: sub.id,
      name: displayName(sub),
      serviceName: serviceNameForIcon(sub),
      amountDollars: centsToDollars(amt),
      daysUntil: getDaysUntilBillingFromSub(sub),
    });
  }
  youOweCandidates.sort((a, b) => a.daysUntil - b.daysUntil);
  const youOweRow = youOweCandidates[0] ?? null;

  let pendingCount = 0;
  let pendingTotalCents = 0;
  for (const sub of active) {
    if (getOwnerId(sub) !== uid) continue;
    const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
    for (const row of shares) {
      if (!row || typeof row !== 'object') continue;
      const mid = String((row as { memberId?: string }).memberId ?? '');
      if (!mid || mid === uid) continue;
      const st = getMemberPaymentStatusRaw(sub, mid);
      if (st === 'invited_pending') continue;
      if (!isCycleDebt(st)) continue;
      pendingCount += 1;
      pendingTotalCents += getMemberShareCents(sub, mid);
    }
  }
  const pendingRow: FloatRowPending | null =
    pendingCount > 0
      ? { kind: 'pending_collect', pendingCount, totalDollars: centsToDollars(pendingTotalCents) }
      : null;

  const overdueCandidates: FloatRowOverdue[] = [];
  for (const sub of active) {
    if (getOwnerId(sub) !== uid) continue;
    const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
    for (const row of shares) {
      if (!row || typeof row !== 'object') continue;
      const mid = String((row as { memberId?: string }).memberId ?? '');
      if (!mid || mid === uid) continue;
      const st = getMemberPaymentStatusRaw(sub, mid);
      if (st === 'invited_pending') continue;
      if (st !== 'overdue') continue;
      const amt = getMemberShareCents(sub, mid);
      if (amt <= 0) continue;
      const daysUntil = getDaysUntilBillingFromSub(sub);
      const daysOverdueApprox = Math.max(1, 30 - Math.min(30, daysUntil));
      overdueCandidates.push({
        kind: 'overdue_collect',
        subscriptionId: sub.id,
        name: displayName(sub),
        serviceName: serviceNameForIcon(sub),
        memberUid: mid,
        amountDollars: centsToDollars(amt),
        daysOverdueApprox,
      });
    }
  }
  overdueCandidates.sort((a, b) => b.daysOverdueApprox - a.daysOverdueApprox);
  const overdueRow = overdueCandidates[0] ?? null;

  return { youOweRow, pendingRow, overdueRow };
}

export type UpcomingSplitRow = {
  id: string;
  name: string;
  meta: string;
  total: number;
  status: string;
  statusColor: string;
  serviceName: string;
  /** Preset catalog id when stored on the subscription doc. */
  serviceId?: string;
};

const C = {
  red: '#E24B4A',
  green: '#1D9E75',
  orange: '#EF9F27',
  muted: '#888780',
};

export function computeUpcomingSplits(subs: RawSub[], uid: string, max = 3): UpcomingSplitRow[] {
  const active = subsAcceptedForViewer(subs, uid).filter((s) => normalizeSubscriptionStatus(s.status) === 'active');
  const withDays = active
    .map((s) => ({ s, d: getDaysUntilBillingFromSub(s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max);

  return withDays.map(({ s, d }) => {
    const total = centsToDollars(getTotalCents(s));
    const owner = getOwnerId(s);
    const share = getMemberShareCents(s, uid);
    const shareD = centsToDollars(share);
    const isOwner = owner === uid;
    let status: string;
    let statusColor: string;
    if (isOwner) {
      status = `collect ${formatUsdDollarsFixed2(shareD)}`;
      statusColor = C.green;
    } else {
      const st = getMemberPaymentStatusRaw(s, uid);
      if (st === 'paid' || st === 'owner') {
        status = 'paid up';
        statusColor = C.green;
      } else if (isCycleDebt(st)) {
        status = `you owe ${formatUsdDollarsFixed2(shareD)}`;
        statusColor = C.red;
      } else {
        status = 'invited';
        statusColor = C.muted;
      }
    }
    const when =
      d === 0 ? 'today' : d === 1 ? 'tomorrow' : d < 14 ? `in ${d} days` : `in ${d} days`;
    const n = Array.isArray(s.splitMemberShares) ? s.splitMemberShares.length : 0;
    const meta = `${n} member${n === 1 ? '' : 's'} · bills ${when}`;
    const sid =
      typeof s.serviceId === 'string' && s.serviceId.trim() ? s.serviceId.trim() : undefined;
    return {
      id: s.id,
      name: displayName(s),
      meta,
      total,
      status,
      statusColor,
      serviceName: serviceNameForIcon(s),
      serviceId: sid,
    };
  });
}

export type FriendBalanceComputed = {
  friendUid: string;
  theyOweMeCents: number;
  iOweThemCents: number;
  netCents: number;
  sortKey: number;
};

export function computeFriendBalances(
  subs: RawSub[],
  viewerUid: string,
  friendUids: string[]
): FriendBalanceComputed[] {
  const chartSubs = subsAcceptedForViewer(subs, viewerUid);
  const rows: FriendBalanceComputed[] = [];
  for (const friendUid of friendUids) {
    if (friendUid === viewerUid) continue;
    let theyOweMeCents = 0;
    let iOweThemCents = 0;

    for (const sub of chartSubs) {
      if (!isActiveLike(sub)) continue;
      const owner = getOwnerId(sub);
      if (owner === viewerUid) {
        const st = getMemberPaymentStatusRaw(sub, friendUid);
        if (st === 'invited_pending') {
          /* not yet accepted — no payment obligation */
        } else if (isCycleDebt(st)) {
          theyOweMeCents += getMemberShareCents(sub, friendUid);
        }
      }
      if (owner === friendUid) {
        const st = getMemberPaymentStatusRaw(sub, viewerUid);
        if (isCycleDebt(st)) {
          iOweThemCents += getMemberShareCents(sub, viewerUid);
        }
      }
    }

    const netCents = theyOweMeCents - iOweThemCents;
    let sortKey = 3;
    if (theyOweMeCents > 0) {
      const st = chartSubs.some(
        (s) =>
          getOwnerId(s) === viewerUid && getMemberPaymentStatusRaw(s, friendUid) === 'overdue'
      );
      sortKey = st ? 0 : 1;
    } else if (iOweThemCents > 0) {
      sortKey = 2;
    }

    rows.push({
      friendUid,
      theyOweMeCents,
      iOweThemCents,
      netCents,
      sortKey,
    });
  }

  rows.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return Math.abs(b.netCents) - Math.abs(a.netCents);
  });
  return rows;
}

/** Count active-like subscriptions where both users appear as members. */
export function countSharedSubscriptionsWithFriend(
  subs: RawSub[],
  viewerUid: string,
  friendUid: string
): number {
  const chartSubs = subsAcceptedForViewer(subs, viewerUid);
  let n = 0;
  for (const sub of chartSubs) {
    if (!isActiveLike(sub)) continue;
    const members = memberUidSet(sub);
    if (members.has(viewerUid) && members.has(friendUid)) n++;
  }
  return n;
}

function memberUidSet(sub: Record<string, unknown>): Set<string> {
  const s = new Set<string>();
  const mu = sub.memberUids;
  if (Array.isArray(mu)) {
    for (const x of mu) {
      if (typeof x === 'string' && x) s.add(x);
    }
  }
  const mem = sub.members;
  if (Array.isArray(mem)) {
    for (const x of mem) {
      if (typeof x === 'string' && x) s.add(x);
      else if (x && typeof x === 'object' && typeof (x as { uid?: string }).uid === 'string') {
        const u = (x as { uid?: string }).uid;
        if (u) s.add(u);
      }
    }
  }
  const shares = sub.splitMemberShares;
  if (Array.isArray(shares)) {
    for (const row of shares) {
      if (row && typeof row === 'object') {
        const mid = String((row as { memberId?: string }).memberId ?? '');
        if (mid) s.add(mid);
      }
    }
  }
  return s;
}
