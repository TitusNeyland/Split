import { fmtCents } from './addSubscriptionSplitMath';
import {
  buildStatusBadge,
  parseFirestoreBillingCycle,
  subscriptionDisplayName,
  type BillingMemberStatus,
} from './billingCalendarModel';
import {
  formatFirstChargeDateShort,
  getNextFirstChargeDate,
  ordinalDay,
  parseBillingDayParam,
} from './billingDayFormat';
import type { SubscriptionPriceBannerFields } from './subscriptionPriceChangeBanner';
import { userLastSeenPriceChangeMs } from './subscriptionPriceChangeBanner';

type CardMemberPip = {
  id: string;
  initials: string;
  backgroundColor: string;
  color: string;
  avatarUrl?: string | null;
  /** Invite pending slot; dashed pip + clock icon. */
  pending?: boolean;
  /** Expired invite slot; dashed pip + alert styling. */
  inviteExpired?: boolean;
};

type StatusPill = {
  backgroundColor: string;
  dotColor: string;
  label: string;
  textColor: string;
};

type CardProgress = {
  percentCollected: number;
  collectedLabel: string;
  rightLabel: string;
  isComplete?: boolean;
  rightLabelColor?: string;
  barColor?: string;
};

export type SubscriptionCardBaseProps = {
  serviceName: string;
  /** Catalog id when present on the subscription doc (Firestore `services` / icons). */
  serviceId?: string;
  name: string;
  nameColor?: string;
  cycleLine: string;
  isOwner?: boolean;
  autoCharge?: 'on' | 'off';
  totalAmount: string;
  perPersonAmount: string;
  totalAmountColor?: string;
  members: CardMemberPip[];
  statusPill: StatusPill;
  dueLabel?: string;
  progress: CardProgress;
  /** Share rows still awaiting invite (same rules as member pips); amber pill on list card. */
  pendingInviteCount?: number;
};

const C = {
  green: '#1D9E75',
  greenDark: '#0F6E56',
  orange: '#EF9F27',
  brown: '#854F0B',
  cream: '#FAEEDA',
  muted: '#888780',
  red: '#E24B4A',
  text: '#1a1a18',
};

/** Firestore: `active` | `ended`. Legacy `paused`, `archived`, and `cancelled` count as ended. */
export type SubscriptionLifecycleStatus = 'active' | 'ended';

export function normalizeSubscriptionStatus(raw: unknown): SubscriptionLifecycleStatus {
  const s = String(raw ?? 'active').toLowerCase();
  if (s === 'active') return 'active';
  return 'ended';
}

export function getTotalCents(data: Record<string, unknown>): number {
  const tc = data.totalCost;
  if (typeof tc === 'number' && Number.isFinite(tc)) return Math.round(tc);
  const t = data.totalCents;
  if (typeof t === 'number' && Number.isFinite(t)) return Math.round(t);
  return 0;
}

export function getOwnerId(data: Record<string, unknown>): string {
  const o = data.ownerUid ?? data.ownerId;
  return typeof o === 'string' ? o : '';
}

function memberPaymentStatusForUid(sub: Record<string, unknown>, viewerUid: string): string {
  const legacy = sub.memberPaymentStatus;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    return String((legacy as Record<string, string>)[viewerUid] ?? '').toLowerCase();
  }
  return '';
}

/**
 * True when the viewer has accepted this split (not awaiting an invite response).
 * Uses `activeMemberUids`, roster, `memberPaymentStatus`, and share rows — fields can lag each other
 * across client/Cloud Function writes, so we treat accepted membership when any reliable signal says so.
 */
export function isViewerAcceptedActiveMember(sub: Record<string, unknown>, viewerUid: string): boolean {
  if (!viewerUid) return false;
  if (normalizeSubscriptionStatus(sub.status) !== 'active') return false;

  const activeUids = sub.activeMemberUids;
  if (Array.isArray(activeUids) && activeUids.includes(viewerUid)) return true;

  if (getOwnerId(sub) === viewerUid) return true;

  const mp = memberPaymentStatusForUid(sub, viewerUid);
  const memberUids = sub.memberUids;
  if (Array.isArray(memberUids) && memberUids.includes(viewerUid) && mp !== '' && mp !== 'invited_pending') {
    if (mp === 'owner' || mp === 'pending' || mp === 'paid' || mp === 'overdue') return true;
  }

  const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
  for (const s of shares) {
    if (!s || typeof s !== 'object') continue;
    if (String((s as { memberId?: string }).memberId) !== viewerUid) continue;
    if ((s as { role?: string }).role === 'owner') return true;
    const ip = (s as { invitePending?: boolean }).invitePending;
    if (ip === false) return true;
    if (ip === true) return false;
    break;
  }

  const members = sub.members;
  if (Array.isArray(members)) {
    for (const m of members) {
      if (!m || typeof m !== 'object') continue;
      if ((m as { uid?: string }).uid !== viewerUid) continue;
      return String((m as { memberStatus?: string }).memberStatus ?? '').toLowerCase() === 'active';
    }
  }

  return false;
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

export function formatCycleLine(data: Record<string, unknown>): string {
  const cycle = parseFirestoreBillingCycle(data.billingCycle);
  const label = effectiveBillingDayLabel(data);
  const cycleWord = cycle === 'yearly' ? 'Yearly' : 'Monthly';
  if (!label) return cycleWord;
  const next = getNextFirstChargeDate(cycle, label);
  const short = next ? formatFirstChargeDateShort(next) : '';
  return short ? `${cycleWord} · ${short}` : `${cycleWord} · ${label}`;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatDueBadgeLabel(data: Record<string, unknown>, now: Date = new Date()): string | undefined {
  const cycle = parseFirestoreBillingCycle(data.billingCycle);
  const label = effectiveBillingDayLabel(data);
  if (!label) return undefined;
  const next = getNextFirstChargeDate(cycle, label);
  if (!next) return undefined;
  const d0 = startOfLocalDay(now).getTime();
  const d1 = startOfLocalDay(next).getTime();
  const diff = Math.round((d1 - d0) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 30) return `${diff} days`;
  return formatFirstChargeDateShort(next);
}

function extractMemberPaymentStatus(data: Record<string, unknown>): Record<string, BillingMemberStatus> {
  const legacy = data.memberPaymentStatus;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    return legacy as Record<string, BillingMemberStatus>;
  }
  const members = data.members;
  if (Array.isArray(members) && members.length && typeof members[0] === 'object' && members[0] !== null) {
    const out: Record<string, BillingMemberStatus> = {};
    for (const m of members as { uid?: string; paymentStatus?: string }[]) {
      if (m.uid && m.paymentStatus) out[m.uid] = m.paymentStatus as BillingMemberStatus;
    }
    return out;
  }
  return {};
}

type ShareRow = {
  memberId?: string;
  displayName?: string;
  initials?: string;
  avatarBg?: string;
  avatarColor?: string;
  amountCents?: number;
  percent?: number;
  invitePending?: boolean;
  /** Set when roster slot expired (job) or share marked expired. */
  inviteExpired?: boolean;
  role?: string;
};

function getRosterMemberStatusByMemberId(data: Record<string, unknown>): Map<string, string> {
  const members = data.members;
  const map = new Map<string, string>();
  if (!Array.isArray(members)) return map;
  for (const m of members) {
    if (m && typeof m === 'object') {
      const uid = (m as { uid?: string }).uid;
      const st = (m as { memberStatus?: string }).memberStatus;
      if (typeof uid === 'string' && uid) map.set(uid, String(st ?? ''));
    }
  }
  return map;
}

/** Roster or share row indicates this invite slot expired before acceptance. */
export function isInviteSlotExpired(data: Record<string, unknown>, s: ShareRow): boolean {
  if (s.role === 'owner') return false;
  if (s.inviteExpired === true) return true;
  const id = String(s.memberId ?? '');
  return getRosterMemberStatusByMemberId(data).get(id) === 'expired';
}

/** True when this share row is a pending (non-expired) invite slot. */
export function isShareRowPendingInvite(data: Record<string, unknown>, s: ShareRow): boolean {
  if (s.role === 'owner') return false;
  if (isInviteSlotExpired(data, s)) return false;
  const id = String(s.memberId ?? '');
  const rosterStatus = getRosterMemberStatusByMemberId(data).get(id);
  // Roster says accepted — always wins.
  if (rosterStatus === 'active') return false;
  // Explicit false on the share row means the invite was accepted — not pending,
  // even if the roster hasn't been updated yet (Cloud Function in-flight).
  if (s.invitePending === false) return false;
  if (s.invitePending === true) return true;
  // No explicit flag — fall back to roster status.
  return rosterStatus === 'pending';
}

/**
 * Non-owner share rows still awaiting invite acceptance. Matches {@link buildMemberPips} /
 * {@link isShareRowPendingInvite}: if `invitePending` is false on the share row, the slot counts as
 * filled even when roster `memberStatus` is still catching up as `pending`.
 */
export function countPendingInviteSlots(data: Record<string, unknown>): number {
  const shares = getSplitShares(data);
  if (shares.length === 0) {
    const roster = data.members;
    if (!Array.isArray(roster)) return 0;
    let n = 0;
    for (const m of roster) {
      if (m && typeof m === 'object' && (m as { memberStatus?: string }).memberStatus === 'pending') {
        n++;
      }
    }
    return n;
  }
  let n = 0;
  for (const s of shares) {
    const row = s as ShareRow;
    if (row.role === 'owner') continue;
    if (isShareRowPendingInvite(data, row)) n++;
  }
  return n;
}

/** Pending or expired invite slot — excluded from billing progress denominator/collected. */
export function isShareRowUnfilledInviteSlot(data: Record<string, unknown>, s: ShareRow): boolean {
  return isShareRowPendingInvite(data, s) || isInviteSlotExpired(data, s);
}

/**
 * Sum of amountCents on filled member share rows (pending/expired invite slots excluded).
 */
export function getActiveMembersTotalCents(data: Record<string, unknown>): number {
  const shares = getSplitShares(data);
  if (shares.length === 0) return getTotalCents(data);
  let sum = 0;
  for (const s of shares) {
    if (isShareRowUnfilledInviteSlot(data, s as ShareRow)) continue;
    const amt =
      typeof s.amountCents === 'number' && Number.isFinite(s.amountCents) ? Math.round(s.amountCents) : 0;
    sum += amt;
  }
  return sum;
}

export function collectedCentsActiveMembersOnly(data: Record<string, unknown>): number {
  const statusMap = extractMemberPaymentStatus(data);
  const shares = getSplitShares(data);
  if (shares.length > 0) {
    let sum = 0;
    for (const s of shares) {
      if (isShareRowUnfilledInviteSlot(data, s as ShareRow)) continue;
      const id = String(s.memberId ?? '');
      if (!id) continue;
      const st = String(statusMap[id] ?? '').toLowerCase();
      const amt =
        typeof s.amountCents === 'number' && Number.isFinite(s.amountCents) ? Math.round(s.amountCents) : 0;
      if (st === 'paid' || st === 'owner') {
        sum += amt;
      }
    }
    return Math.min(sum, getTotalCents(data));
  }
  return collectedCentsForSubscription(data);
}

function getSplitShares(data: Record<string, unknown>): ShareRow[] {
  const arr = data.splitMemberShares;
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => x && typeof x === 'object') as ShareRow[];
}

/**
 * Single source of truth for a member's share of `totalCost` / `totalCents` (always integer cents).
 * Prefer denormalized `splitMemberShares[].amountCents` when present (includes Option A owner = full total
 * while invites are pending); otherwise compute from the `members` roster.
 */
export function getMemberAmountCents(data: Record<string, unknown>, memberUid: string): number {
  if (!memberUid) return 0;
  const shares = getSplitShares(data);
  if (shares.length > 0) {
    const row = shares.find((s) => String(s.memberId) === memberUid);
    if (row && typeof row.amountCents === 'number' && Number.isFinite(row.amountCents)) {
      if (isShareRowUnfilledInviteSlot(data, row as ShareRow)) return 0;
      return Math.round(row.amountCents);
    }
  }

  return computeMemberShareFromRosterOnly(data, memberUid);
}

/**
 * Planned personal share from the `members` roster only (fixed / % / equal among participants).
 * Includes **pending** invitees (not yet accepted) so Subscriptions "Your share" matches the planned
 * split. Excludes `left` / `expired` / unknown. When there is no object roster, falls back to
 * {@link getMemberAmountCents}.
 */
export function getMemberPlannedShareCents(data: Record<string, unknown>, memberUid: string): number {
  const members = data.members;
  if (!Array.isArray(members) || !members.length || typeof members[0] !== 'object') {
    return getMemberAmountCents(data, memberUid);
  }
  return computeMemberShareFromRosterOnly(data, memberUid);
}

/** Roster rows that still count toward the planned split (invited-but-not-accepted = pending). */
function rosterMemberIncludedInPlannedShare(memberStatus: string): boolean {
  const s = memberStatus.toLowerCase();
  return s === 'active' || s === 'pending';
}

function rosterParticipantCountForEqualSplit(members: Record<string, unknown>[]): number {
  let n = 0;
  for (const x of members) {
    if (!x || typeof x !== 'object') continue;
    const st = String((x as { memberStatus?: string }).memberStatus ?? '').toLowerCase();
    if (rosterMemberIncludedInPlannedShare(st)) n += 1;
  }
  return n;
}

function computeMemberShareFromRosterOnly(data: Record<string, unknown>, memberUid: string): number {
  if (!memberUid) return 0;
  const total = getTotalCents(data);
  const members = data.members as Record<string, unknown>[];
  const m = members.find(
    (x) => x && typeof x === 'object' && (x as { uid?: string }).uid === memberUid
  );
  if (!m) return 0;
  const memberStatus = String((m as { memberStatus?: string }).memberStatus ?? '').toLowerCase();
  if (!rosterMemberIncludedInPlannedShare(memberStatus)) {
    return 0;
  }

  const sm = String((m as { splitMethod?: string }).splitMethod ?? '').toLowerCase();
  if ((sm === 'fixed' || sm === 'fixed_amount') && typeof (m as { fixedAmount?: number }).fixedAmount === 'number') {
    const fa = (m as { fixedAmount: number }).fixedAmount;
    if (Number.isFinite(fa)) return Math.round(fa);
  }
  const pct = (m as { percentage?: number }).percentage;
  if (typeof pct === 'number' && Number.isFinite(pct) && pct > 0) {
    return Math.round((total * pct) / 100);
  }

  const participantCount = rosterParticipantCountForEqualSplit(members);
  if (participantCount === 0) return 0;
  return Math.round(total / participantCount);
}

/** @deprecated Prefer {@link getMemberAmountCents}; kept for existing call sites. */
export function getViewerShareCents(data: Record<string, unknown>, viewerUid: string): number {
  return getMemberAmountCents(data, viewerUid);
}

export function collectedCentsForSubscription(data: Record<string, unknown>): number {
  const total = getTotalCents(data);
  const statusMap = extractMemberPaymentStatus(data);
  const shares = getSplitShares(data);

  if (shares.length > 0) {
    let sum = 0;
    for (const s of shares) {
      const id = String(s.memberId ?? '');
      if (!id) continue;
      const st = String(statusMap[id] ?? '').toLowerCase();
      const amt =
        typeof s.amountCents === 'number' && Number.isFinite(s.amountCents) ? Math.round(s.amountCents) : 0;
      if (st === 'paid' || st === 'owner') {
        sum += amt;
      }
    }
    return Math.min(sum, total);
  }

  const members = data.members;
  if (Array.isArray(members) && members.length && typeof members[0] === 'object') {
    let sum = 0;
    for (const m of members as {
      uid?: string;
      paymentStatus?: string;
      fixedAmount?: number;
      percentage?: number;
    }[]) {
      const st = String(m.paymentStatus ?? '').toLowerCase();
      if (st !== 'paid' && st !== 'owner') continue;
      let amt = 0;
      if (typeof m.fixedAmount === 'number' && Number.isFinite(m.fixedAmount)) {
        amt = Math.round(m.fixedAmount);
      } else if (typeof m.percentage === 'number' && Number.isFinite(m.percentage)) {
        amt = Math.round((total * m.percentage) / 100);
      }
      sum += amt;
    }
    return Math.min(sum, total);
  }

  return 0;
}

function statusPillFromBadge(badge: ReturnType<typeof buildStatusBadge>): StatusPill {
  const { label, textColor, backgroundColor } = badge;
  const t = label.toLowerCase();
  if (t.includes('overdue')) {
    return {
      backgroundColor: backgroundColor ?? '#FCEBEB',
      dotColor: C.red,
      label,
      textColor,
    };
  }
  if (t.includes('pending')) {
    return {
      backgroundColor: backgroundColor ?? C.cream,
      dotColor: C.orange,
      label,
      textColor,
    };
  }
  if (t.includes('all paid')) {
    return {
      backgroundColor: '#E1F5EE',
      dotColor: C.green,
      label,
      textColor,
    };
  }
  return {
    backgroundColor: '#F0EEE9',
    dotColor: C.muted,
    label,
    textColor,
  };
}

export function buildMemberPips(
  data: Record<string, unknown>,
  viewerUid: string,
  viewerAvatarUrl: string | null
): CardMemberPip[] {
  const shares = getSplitShares(data);
  if (shares.length === 0) {
    const members = data.members;
    if (Array.isArray(members) && members.length && typeof members[0] === 'object') {
      return (members as { uid?: string; displayName?: string }[]).map((m, i) => ({
        id: m.uid ?? `m-${i}`,
        initials: '??',
        backgroundColor: '#E8E6E1',
        color: C.text,
        avatarUrl: m.uid === viewerUid ? viewerAvatarUrl : null,
      }));
    }
    return [];
  }
  return shares.map((s, i) => {
    const id = String(s.memberId ?? i);
    const pending = isShareRowPendingInvite(data, s as ShareRow);
    const inviteExpired = isInviteSlotExpired(data, s as ShareRow);
    const initials =
      typeof s.initials === 'string' && s.initials.trim()
        ? s.initials.trim().slice(0, 2).toUpperCase()
        : '??';
    const backgroundColor = typeof s.avatarBg === 'string' && s.avatarBg ? s.avatarBg : '#E8E6E1';
    const color = typeof s.avatarColor === 'string' && s.avatarColor ? s.avatarColor : C.text;
    return {
      id,
      initials,
      backgroundColor,
      color,
      avatarUrl: id === viewerUid ? viewerAvatarUrl : null,
      pending,
      inviteExpired,
    };
  });
}

function serviceNameForIcon(data: Record<string, unknown>): string {
  const sn = data.serviceName;
  if (typeof sn === 'string' && sn.trim()) return sn.trim();
  const sid = data.serviceId;
  if (typeof sid === 'string' && sid.trim()) {
    const t = sid.trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return 'Subscription';
}

function perPersonLabel(data: Record<string, unknown>, totalCents: number): string {
  const shares = getSplitShares(data);
  const n = shares.length;
  if (n <= 0) {
    const members = data.members;
    const mc = Array.isArray(members) ? members.length : 0;
    if (mc <= 0) return '$0.00/person';
    const each = Math.floor(totalCents / mc);
    return `${fmtCents(each)}/person`;
  }
  const amounts = shares.map((s) =>
    typeof s.amountCents === 'number' && Number.isFinite(s.amountCents) ? Math.round(s.amountCents) : 0
  );
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (min === max) return `${fmtCents(min)}/person`;
  return `${fmtCents(min)}–${fmtCents(max)}/person`;
}

function memberCountForSubscriptionCard(data: Record<string, unknown>): number {
  const shares = getSplitShares(data);
  if (shares.length > 0) return shares.length;
  const members = data.members;
  return Array.isArray(members) ? members.length : 0;
}

/** For ended list sub-label: exclude invite-pending rows when `splitMemberShares` exists. */
function memberCountForEndedSubLabel(data: Record<string, unknown>): number {
  const shares = getSplitShares(data);
  if (shares.length > 0) {
    return shares.filter((s) => {
      const row = s as { invitePending?: boolean; inviteExpired?: boolean };
      return !row.invitePending && !row.inviteExpired;
    }).length;
  }
  const members = data.members;
  return Array.isArray(members) ? members.length : 0;
}

export function subscriptionEndedAtMillis(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && 'toMillis' in raw) {
    const fn = (raw as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(raw);
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    }
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const s = (raw as { seconds: number }).seconds;
    if (typeof s === 'number' && Number.isFinite(s)) return s * 1000;
  }
  return null;
}

/** e.g. "Mar 2026" for ended subscription sub-label. */
export function formatEndedAtMonthYear(data: Record<string, unknown>): string {
  const ms = subscriptionEndedAtMillis(data.endedAt);
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatEndedListCycleLine(data: Record<string, unknown>, nMembers: number): string {
  const monthYear = formatEndedAtMonthYear(data);
  const memberPart =
    nMembers > 0 ? `${nMembers} member${nMembers === 1 ? '' : 's'}` : '';
  if (monthYear && memberPart) return `Ended ${monthYear} · ${memberPart}`;
  if (monthYear) return `Ended ${monthYear}`;
  if (memberPart) return `Ended · ${memberPart}`;
  return 'Ended';
}

export function buildSubscriptionCardBase(
  doc: { id: string } & Record<string, unknown>,
  viewerUid: string,
  viewerAvatarUrl: string | null,
  options?: { muted?: boolean; splitEnded?: boolean }
): SubscriptionCardBaseProps {
  const data = doc as Record<string, unknown>;
  const totalCents = getTotalCents(data);
  const splitEnded = Boolean(options?.splitEnded);
  const displayName = subscriptionDisplayName(
    typeof data.serviceName === 'string' ? data.serviceName : '',
    typeof data.planName === 'string' ? data.planName : undefined
  );
  const statusMap = extractMemberPaymentStatus(data);
  const pendingInviteCount = countPendingInviteSlots(data);
  const badge = buildStatusBadge(statusMap, viewerUid, {
    pendingAcceptanceCount: pendingInviteCount,
  });
  const activeTotal = getActiveMembersTotalCents(data);
  const collectedActive = collectedCentsActiveMembersOnly(data);
  const collectedEnded = collectedCentsForSubscription(data);
  const pct =
    splitEnded && totalCents > 0
      ? Math.min(100, Math.round((100 * collectedEnded) / totalCents))
      : activeTotal > 0
        ? Math.min(100, Math.round((100 * collectedActive) / activeTotal))
        : 0;
  const ownerId = getOwnerId(data);
  const auto = data.autoCharge === true ? 'on' : data.autoCharge === false ? 'off' : undefined;
  const progressDenominatorCents = splitEnded ? totalCents : activeTotal;
  const progressCollectedCents = splitEnded ? collectedEnded : collectedActive;
  const remaining = Math.max(0, progressDenominatorCents - progressCollectedCents);
  const isComplete =
    progressDenominatorCents > 0 && progressCollectedCents >= progressDenominatorCents;
  const muted = Boolean(options?.muted || splitEnded);

  const endedCycleLine = splitEnded
    ? formatEndedListCycleLine(data, memberCountForEndedSubLabel(data))
    : '';

  const sid = typeof data.serviceId === 'string' && data.serviceId.trim() ? data.serviceId.trim() : undefined;

  return {
    serviceName: serviceNameForIcon(data),
    serviceId: sid,
    name: displayName,
    nameColor: muted ? C.muted : C.text,
    cycleLine: splitEnded ? endedCycleLine : formatCycleLine(data),
    isOwner: Boolean(viewerUid && ownerId === viewerUid),
    autoCharge: splitEnded ? undefined : auto,
    totalAmount: fmtCents(totalCents),
    totalAmountColor: muted ? C.muted : C.text,
    perPersonAmount: perPersonLabel(data, totalCents),
    members: buildMemberPips(data, viewerUid, viewerAvatarUrl),
    statusPill: splitEnded
      ? {
          backgroundColor: '#F0EEE9',
          dotColor: C.muted,
          label: 'Ended',
          textColor: C.muted,
        }
      : statusPillFromBadge(badge),
    dueLabel: splitEnded ? undefined : formatDueBadgeLabel(data),
    progress: splitEnded
      ? {
          percentCollected: pct,
          collectedLabel: `${fmtCents(collectedEnded)} collected`,
          rightLabel: isComplete ? 'Complete' : fmtCents(totalCents),
          isComplete,
          rightLabelColor: C.muted,
          barColor: C.muted,
        }
      : {
          percentCollected: pct,
          collectedLabel: `${fmtCents(collectedActive)} collected`,
          rightLabel: isComplete ? 'Complete' : fmtCents(activeTotal),
          isComplete,
          rightLabelColor: isComplete ? C.greenDark : remaining > 0 ? C.text : C.muted,
          barColor: options?.muted ? C.muted : C.green,
        },
    pendingInviteCount: splitEnded ? 0 : pendingInviteCount,
  };
}

export function extractPriceBannerFields(data: Record<string, unknown>): SubscriptionPriceBannerFields | null {
  const priceChangedAt = data.priceChangedAt as { toMillis?: () => number } | undefined;
  const from =
    typeof data.priceChangeFromCents === 'number'
      ? data.priceChangeFromCents
      : typeof data.previousPrice === 'number'
        ? data.previousPrice
        : null;
  const to =
    typeof data.priceChangeToCents === 'number'
      ? data.priceChangeToCents
      : typeof data.totalCost === 'number'
        ? data.totalCost
        : typeof data.totalCents === 'number'
          ? data.totalCents
          : null;
  if (
    !priceChangedAt ||
    typeof (priceChangedAt as { toMillis?: () => number }).toMillis !== 'function' ||
    from == null ||
    to == null
  ) {
    return null;
  }
  let billingDayOfMonth: number | null = null;
  const bd = data.billingDay;
  if (typeof bd === 'number' && bd >= 1 && bd <= 31) {
    billingDayOfMonth = bd;
  } else {
    const label = effectiveBillingDayLabel(data);
    const parsed = parseBillingDayParam(label);
    if (parsed) billingDayOfMonth = parsed.day;
  }
  return {
    priceChangedAt: priceChangedAt as { toMillis: () => number },
    priceChangeFromCents: from,
    priceChangeToCents: to,
    billingDayOfMonth,
  };
}

export function lastSeenMsForSubscription(
  profileMap: Record<string, { toMillis?: () => number }> | null | undefined,
  subscriptionId: string
): number | null {
  return userLastSeenPriceChangeMs(profileMap ?? null, subscriptionId);
}

export function subscriptionIsUserOverdue(
  data: Record<string, unknown>,
  viewerUid: string
): boolean {
  const st = extractMemberPaymentStatus(data)[viewerUid];
  return String(st ?? '').toLowerCase() === 'overdue';
}
