import { doc, onSnapshot, Timestamp, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebaseFirestore } from '../firebase';
import { parseFirestoreBillingCycle, subscriptionDisplayName } from './billingCalendarModel';
import {
  formatFirstChargeDateLong,
  getNextFirstChargeDate,
  ordinalDay,
} from './billingDayFormat';
import { initialsFromName } from '../profile/profile';
import type {
  CyclePaymentStatus,
  OwnerMemberLeftBanner,
  SplitInviteDeclineNotice,
  SubscriptionDetailEditorMember,
  SubscriptionDetailMember,
  SubscriptionDetailModel,
  SubscriptionHistoryCycle,
} from './subscriptionDetailTypes';
import {
  collectedCentsActiveMembersOnly,
  getActiveMembersTotalCents,
  getOwnerId,
  getTotalCents,
  isInviteSlotExpired,
  isShareRowPendingInvite,
  normalizeSubscriptionStatus,
  subscriptionEndedAtMillis,
} from './subscriptionToCardModel';

type ShareRow = {
  memberId?: string;
  displayName?: string;
  role?: string;
  percent?: number;
  amountCents?: number;
  initials?: string;
  avatarBg?: string;
  avatarColor?: string;
  invitePending?: boolean;
  inviteExpired?: boolean;
  inviteId?: string;
  pendingInviteEmail?: string;
  inviteExpiresAt?: Timestamp | { toMillis?: () => number };
};

function rosterEmailForUid(data: Record<string, unknown>, uid: string): string | null {
  const members = data.members;
  if (!Array.isArray(members)) return null;
  for (const m of members) {
    if (m && typeof m === 'object') {
      const id = String((m as { uid?: string }).uid ?? '');
      if (id === uid) {
        const email = (m as { email?: string }).email;
        return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
      }
    }
  }
  return null;
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

function getSplitShares(data: Record<string, unknown>): ShareRow[] {
  const arr = data.splitMemberShares;
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => x && typeof x === 'object') as ShareRow[];
}

function getMemberPaymentMap(data: Record<string, unknown>): Record<string, string> {
  const m = data.memberPaymentStatus;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    return m as Record<string, string>;
  }
  return {};
}

function toCycleStatus(raw: string | undefined): CyclePaymentStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'paid' || s === 'owner') return 'paid';
  if (s === 'overdue') return 'overdue';
  if (s === 'invited_pending') return 'pending';
  return 'pending';
}

function viewerYouDisplayName(viewerFirstName: string): string {
  const n = viewerFirstName.trim() || 'You';
  return `${n} (you)`;
}

/** Stale "(you)" from another account can be stored on `splitMemberShares`; never show it on other members. */
function cleanOtherMemberDisplayName(raw: string): string {
  const s = raw.trim().replace(/\s*\(you\)\s*$/i, '').trim();
  return s || 'Member';
}

function inviteExpiresAtMsFromRow(row: ShareRow): number | null {
  const ex = row.inviteExpiresAt;
  if (ex instanceof Timestamp) return ex.toMillis();
  if (ex && typeof ex === 'object' && typeof ex.toMillis === 'function') {
    return ex.toMillis();
  }
  return null;
}

/**
 * Maps `subscriptions/{id}` document data to the subscription detail UI model.
 */
export function mapFirestoreSubscriptionToDetailModel(
  data: Record<string, unknown> & { id: string },
  viewerUid: string,
  userAvatarUrl: string | null,
  viewerFirstName: string
): SubscriptionDetailModel | null {
  const id = String(data.id);
  const totalCents = getTotalCents(data);
  const serviceNameRaw = typeof data.serviceName === 'string' ? data.serviceName : '';
  const planName = typeof data.planName === 'string' ? data.planName : undefined;
  const displayName = subscriptionDisplayName(serviceNameRaw, planName);
  const serviceNameForIcon = serviceNameRaw.trim() || displayName;

  const cycle = parseFirestoreBillingCycle(data.billingCycle);
  const billingCycleLabel = cycle === 'yearly' ? 'Yearly' : 'Monthly';
  const dayLabel = effectiveBillingDayLabel(data);
  const nextDate = dayLabel ? getNextFirstChargeDate(cycle, dayLabel) : null;
  const nextBillingLabel = nextDate ? formatFirstChargeDateLong(nextDate) : '—';

  const subscriptionOwnerUid = getOwnerId(data);
  const isOwner = Boolean(viewerUid && subscriptionOwnerUid === viewerUid);

  const statusByMember = getMemberPaymentMap(data);
  const rows = getSplitShares(data);
  if (rows.length === 0) {
    return null;
  }

  const ownerRow = rows.find((r) => r.role === 'owner');
  const payerName =
    ownerRow?.displayName?.trim() ||
    (typeof data.payerDisplay === 'string' ? data.payerDisplay.trim() : '') ||
    'Owner';

  const members: SubscriptionDetailMember[] = rows.map((row) => {
    const memberId = String(row.memberId ?? '');
    const isViewer = Boolean(viewerUid && memberId === viewerUid);
    const st = statusByMember[memberId];
    const cycleStatus = toCycleStatus(st);
    const amountCents =
      typeof row.amountCents === 'number' && Number.isFinite(row.amountCents)
        ? Math.round(row.amountCents)
        : 0;
    let percent = 0;
    if (typeof row.percent === 'number' && Number.isFinite(row.percent)) {
      percent = Math.round(row.percent);
    } else if (totalCents > 0) {
      percent = Math.round((100 * amountCents) / totalCents);
    }
    const inviteExpired = isInviteSlotExpired(data, row);
    const invitePending = isShareRowPendingInvite(data, row);
    const pendingInviteEmail =
      typeof row.pendingInviteEmail === 'string' && row.pendingInviteEmail.trim()
        ? row.pendingInviteEmail.trim().toLowerCase()
        : null;
    const rosterEmail = rosterEmailForUid(data, memberId);
    const rawName = String(row.displayName ?? 'Member');
    const displayName = isViewer
      ? viewerYouDisplayName(viewerFirstName)
      : cleanOtherMemberDisplayName(rawName);
    const initials = isViewer
      ? initialsFromName(viewerFirstName.trim() || 'You')
      : String(row.initials ?? '?').slice(0, 2).toUpperCase();
    return {
      memberId,
      displayName,
      initials,
      avatarBg: typeof row.avatarBg === 'string' && row.avatarBg ? row.avatarBg : '#E8E6E1',
      avatarColor: typeof row.avatarColor === 'string' && row.avatarColor ? row.avatarColor : '#1a1a18',
      avatarUrl: memberId === viewerUid ? userAvatarUrl : undefined,
      percent,
      amountCents,
      cycleStatus,
      invitePending,
      inviteExpired,
      inviteId: typeof row.inviteId === 'string' && row.inviteId ? row.inviteId : undefined,
      pendingInviteEmail,
      rosterEmail,
      inviteExpiresAtMs: invitePending ? inviteExpiresAtMsFromRow(row) : null,
    };
  });

  const editorMembers: SubscriptionDetailEditorMember[] = rows.map((row) => {
    const memberId = String(row.memberId ?? '');
    const isViewer = Boolean(viewerUid && memberId === viewerUid);
    const rawName = String(row.displayName ?? 'Member');
    const displayName = isViewer
      ? viewerYouDisplayName(viewerFirstName)
      : cleanOtherMemberDisplayName(rawName);
    const initials = isViewer
      ? initialsFromName(viewerFirstName.trim() || 'You')
      : String(row.initials ?? '?').slice(0, 2).toUpperCase();
    return {
      memberId,
      displayName,
      initials,
      avatarBg: typeof row.avatarBg === 'string' && row.avatarBg ? row.avatarBg : '#E8E6E1',
      avatarColor: typeof row.avatarColor === 'string' && row.avatarColor ? row.avatarColor : '#1a1a18',
      avatarUrl: memberId === viewerUid ? userAvatarUrl : null,
    };
  });

  const paidMemberCount = members.filter(
    (m) => !m.invitePending && !m.inviteExpired && m.cycleStatus === 'paid'
  ).length;
  const collectedCents = collectedCentsActiveMembersOnly(data);
  const activeMembersTotalCents = getActiveMembersTotalCents(data);

  const autoCharge = data.autoCharge === true ? 'on' : 'off';
  const lifecycleStatus = normalizeSubscriptionStatus(data.status) === 'ended' ? 'ended' : 'active';
  const endedMs = subscriptionEndedAtMillis(data.endedAt);
  const endedOnLabel =
    lifecycleStatus === 'ended' && endedMs != null
      ? formatFirstChargeDateLong(new Date(endedMs))
      : undefined;

  const allPaid = activeMembersTotalCents > 0 && collectedCents >= activeMembersTotalCents;
  const history: SubscriptionHistoryCycle[] = [
    {
      key: 'current',
      label: 'Current cycle',
      totalCents,
      allPaid,
      lines: members.map((m) => ({
        memberId: m.memberId,
        displayName: m.displayName,
        amountCents: m.amountCents,
        paid: m.cycleStatus === 'paid',
      })),
    },
  ];

  let splitInviteDeclineNotices: SplitInviteDeclineNotice[] | undefined;
  const rawDeclines = data.splitInviteDeclineNotices;
  if (Array.isArray(rawDeclines) && rawDeclines.length > 0 && isOwner) {
    const parsed: SplitInviteDeclineNotice[] = [];
    for (const row of rawDeclines) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const declinerName =
        typeof o.declinerName === 'string' && o.declinerName.trim() ? o.declinerName.trim() : '';
      if (!declinerName) continue;
      parsed.push({
        declinerName,
        declinerUid: typeof o.declinerUid === 'string' ? o.declinerUid : undefined,
        inviteId: typeof o.inviteId === 'string' ? o.inviteId : undefined,
      });
    }
    if (parsed.length > 0) splitInviteDeclineNotices = parsed;
  }

  let ownerMemberLeftBanner: OwnerMemberLeftBanner | null | undefined;
  const rawBanner = data.ownerMemberLeftBanner;
  if (
    isOwner &&
    rawBanner &&
    typeof rawBanner === 'object' &&
    rawBanner !== null
  ) {
    const o = rawBanner as Record<string, unknown>;
    const leaverDisplayName =
      typeof o.leaverDisplayName === 'string' && o.leaverDisplayName.trim()
        ? o.leaverDisplayName.trim()
        : '';
    const shareCents =
      typeof o.shareCents === 'number' && Number.isFinite(o.shareCents) ? Math.round(o.shareCents) : 0;
    if (leaverDisplayName) {
      ownerMemberLeftBanner = { leaverDisplayName, shareCents };
    }
  }

  const customSplitNeedsRebalance = isOwner && data.customSplitNeedsRebalance === true;

  return {
    id,
    serviceName: serviceNameForIcon,
    displayName,
    billingCycleLabel,
    nextBillingLabel,
    totalCents,
    isOwner,
    payerName: isOwner ? undefined : payerName,
    autoCharge,
    lifecycleStatus,
    endedOnLabel,
    ownerMemberLeftBanner,
    customSplitNeedsRebalance,
    members,
    paidMemberCount,
    collectedCents,
    activeMembersTotalCents,
    editorMembers,
    history,
    splitInviteDeclineNotices,
  };
}

export function useSubscriptionDetailFromFirestore(
  subscriptionId: string,
  viewerUid: string | null,
  userAvatarUrl: string | null,
  viewerFirstName: string,
  options: { enabled: boolean; retryKey?: number }
): {
  detail: SubscriptionDetailModel | null;
  loading: boolean;
  error: 'not-found' | 'permission' | 'unavailable' | null;
  /** Present when `error === 'unavailable'` or listener threw (for support / retry copy). */
  errorMessage: string | null;
} {
  const enabled = options.enabled;
  const retryKey = options.retryKey ?? 0;
  const [detail, setDetail] = useState<SubscriptionDetailModel | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<'not-found' | 'permission' | 'unavailable' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDetail(null);
      setLoading(false);
      setError(null);
      setErrorMessage(null);
      return;
    }
    if (!subscriptionId || !viewerUid) {
      setDetail(null);
      setLoading(false);
      setError(null);
      setErrorMessage(null);
      return;
    }

    const db = getFirebaseFirestore();
    if (!db) {
      setDetail(null);
      setLoading(false);
      setError('unavailable');
      setErrorMessage('Firestore is not configured.');
      console.error('SubscriptionDetail: Firestore not configured');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorMessage(null);

    const ref = doc(db, 'subscriptions', subscriptionId);
    let unsub: Unsubscribe | undefined;
    unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          console.error('Subscription not found:', subscriptionId);
          setDetail(null);
          setError('not-found');
          setErrorMessage(null);
          setLoading(false);
          return;
        }
        const raw = { id: snap.id, ...snap.data() } as Record<string, unknown> & { id: string };
        const model = mapFirestoreSubscriptionToDetailModel(
          raw,
          viewerUid,
          userAvatarUrl,
          viewerFirstName
        );
        if (!model) {
          console.error('Subscription detail: document missing splitMemberShares or invalid shape', subscriptionId);
          setDetail(null);
          setError('unavailable');
          setErrorMessage(null);
          setLoading(false);
          return;
        }
        setDetail(model);
        setError(null);
        setErrorMessage(null);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore error on subscription detail:', err);
        const code = (err as { code?: string }).code;
        const msg = err instanceof Error ? err.message : String(err);
        setDetail(null);
        setLoading(false);
        setErrorMessage(msg);
        if (code === 'permission-denied') {
          setError('permission');
        } else {
          setError('unavailable');
        }
      }
    );

    return () => {
      unsub?.();
    };
  }, [subscriptionId, viewerUid, userAvatarUrl, viewerFirstName, enabled, retryKey]);

  return { detail, loading, error, errorMessage };
}
