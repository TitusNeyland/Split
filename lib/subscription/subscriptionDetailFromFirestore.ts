import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebaseFirestore } from '../firebase';
import { parseFirestoreBillingCycle, subscriptionDisplayName } from './billingCalendarModel';
import {
  formatFirstChargeDateLong,
  getNextFirstChargeDate,
  ordinalDay,
} from './billingDayFormat';
import type {
  CyclePaymentStatus,
  SubscriptionDetailEditorMember,
  SubscriptionDetailMember,
  SubscriptionDetailModel,
  SubscriptionHistoryCycle,
} from './subscriptionDetailDemo';
import { collectedCentsForSubscription, getOwnerId, getTotalCents } from './subscriptionToCardModel';

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
};

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
  return 'pending';
}

/**
 * Maps `subscriptions/{id}` document data to the subscription detail UI model.
 */
export function mapFirestoreSubscriptionToDetailModel(
  data: Record<string, unknown> & { id: string },
  viewerUid: string,
  userAvatarUrl: string | null
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
    return {
      memberId,
      displayName: String(row.displayName ?? 'Member'),
      initials: String(row.initials ?? '?').slice(0, 2).toUpperCase(),
      avatarBg: typeof row.avatarBg === 'string' && row.avatarBg ? row.avatarBg : '#E8E6E1',
      avatarColor: typeof row.avatarColor === 'string' && row.avatarColor ? row.avatarColor : '#1a1a18',
      avatarUrl: memberId === viewerUid ? userAvatarUrl : undefined,
      percent,
      amountCents,
      cycleStatus,
    };
  });

  const editorMembers: SubscriptionDetailEditorMember[] = rows.map((row) => {
    const memberId = String(row.memberId ?? '');
    return {
      memberId,
      displayName: String(row.displayName ?? 'Member'),
      initials: String(row.initials ?? '?').slice(0, 2).toUpperCase(),
      avatarBg: typeof row.avatarBg === 'string' && row.avatarBg ? row.avatarBg : '#E8E6E1',
      avatarColor: typeof row.avatarColor === 'string' && row.avatarColor ? row.avatarColor : '#1a1a18',
      avatarUrl: memberId === viewerUid ? userAvatarUrl : null,
    };
  });

  const paidMemberCount = members.filter((m) => m.cycleStatus === 'paid').length;
  const collectedCents = collectedCentsForSubscription(data);

  const autoCharge = data.autoCharge === true ? 'on' : 'off';

  const allPaid = totalCents > 0 && collectedCents >= totalCents;
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
    members,
    paidMemberCount,
    collectedCents,
    editorMembers,
    history,
  };
}

export function useSubscriptionDetailFromFirestore(
  subscriptionId: string,
  viewerUid: string | null,
  userAvatarUrl: string | null,
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
        const model = mapFirestoreSubscriptionToDetailModel(raw, viewerUid, userAvatarUrl);
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
  }, [subscriptionId, viewerUid, userAvatarUrl, enabled, retryKey]);

  return { detail, loading, error, errorMessage };
}
