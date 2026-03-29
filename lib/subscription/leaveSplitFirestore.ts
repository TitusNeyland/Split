import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import {
  equalCentsSplit,
  equalIntegerPercents,
  ownerLessCentsSplit,
  ownerLessIntegerPercents,
} from './addSubscriptionSplitMath';
import { getOwnerId, getTotalCents } from './subscriptionToCardModel';
import type { SubscriptionMemberRosterRow } from './subscriptionSplitRecalc';
import { syncOwnerShareForPendingInvites } from './subscriptionSplitRecalc';

function isObjectRoster(raw: unknown): raw is Record<string, unknown>[] {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const first = raw[0];
  return first != null && typeof first === 'object' && !Array.isArray(first);
}

/**
 * Redistribute percents/amounts after removing one active member share row.
 * `custom_percent` / `fixed_amount` / `fixed` → no math; caller sets `customSplitNeedsRebalance`.
 */
function redistributeActiveShares(
  shares: Record<string, unknown>[],
  totalCents: number,
  splitMethod: string
): Record<string, unknown>[] {
  const list = shares.map((x) => ({ ...x }));
  const active = list.filter((s) => {
    const ip = (s as { invitePending?: boolean }).invitePending;
    const ie = (s as { inviteExpired?: boolean }).inviteExpired;
    return !ip && !ie;
  });
  if (active.length === 0) return list;

  const sm = String(splitMethod || 'equal');

  if (sm === 'owner_less') {
    const nTotal = active.length;
    if (nTotal <= 0) return list;
    const pcts = ownerLessIntegerPercents(nTotal);
    const cents = ownerLessCentsSplit(totalCents, nTotal);
    let j = 0;
    return list.map((s) => {
      const ip = (s as { invitePending?: boolean }).invitePending;
      const ie = (s as { inviteExpired?: boolean }).inviteExpired;
      if (ip || ie) return s;
      const pct = pcts[j] ?? 0;
      const c = cents[j] ?? 0;
      j += 1;
      return { ...s, percent: pct, amountCents: Math.round(c) };
    });
  }

  if (sm === 'equal') {
    const n = active.length;
    const pcts = equalIntegerPercents(n);
    const cents = equalCentsSplit(totalCents, n);
    let j = 0;
    return list.map((s) => {
      const ip = (s as { invitePending?: boolean }).invitePending;
      const ie = (s as { inviteExpired?: boolean }).inviteExpired;
      if (ip || ie) return s;
      const pct = pcts[j] ?? 0;
      const c = cents[j] ?? 0;
      j += 1;
      return { ...s, percent: pct, amountCents: Math.round(c) };
    });
  }

  return list;
}

function syncRosterWithShares(
  roster: SubscriptionMemberRosterRow[],
  shares: Record<string, unknown>[]
): SubscriptionMemberRosterRow[] {
  const byMid = new Map<string, Record<string, unknown>>();
  for (const s of shares) {
    if (!s || typeof s !== 'object') continue;
    const mid = String((s as { memberId?: string }).memberId ?? '');
    if (mid) byMid.set(mid, s as Record<string, unknown>);
  }
  return roster.map((r) => {
    const uid = typeof r.uid === 'string' ? r.uid : '';
    if (!uid) return r;
    if (String(r.memberStatus ?? '').toLowerCase() === 'left') return r;
    const sh = byMid.get(uid);
    if (!sh) return r;
    const pct = typeof sh.percent === 'number' && Number.isFinite(sh.percent) ? sh.percent : r.percentage;
    const amt =
      typeof sh.amountCents === 'number' && Number.isFinite(sh.amountCents)
        ? Math.round(sh.amountCents)
        : r.fixedAmount;
    return {
      ...r,
      percentage: typeof pct === 'number' ? Math.round(pct * 100) / 100 : r.percentage,
      fixedAmount: typeof amt === 'number' ? amt : r.fixedAmount,
    };
  });
}

/**
 * Non-owner leaves: removes their share row and uid lists; optional equal/owner_less redistribution.
 * Sets `leaveVoluntaryUid` for Cloud Functions (activity + push); CF clears the field.
 */
export async function leaveSubscriptionSplit(params: {
  subscriptionId: string;
  memberUid: string;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const subRef = doc(db, 'subscriptions', params.subscriptionId);

  await runTransaction(db, async (tx) => {
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists()) throw new Error('Subscription not found.');
    const data = subSnap.data() as Record<string, unknown>;

    const ownerUid = getOwnerId(data);
    if (!ownerUid) throw new Error('Invalid subscription.');
    if (ownerUid === params.memberUid) throw new Error('Owner cannot leave this way.');

    const shares = Array.isArray(data.splitMemberShares) ? [...data.splitMemberShares] : [];
    const idx = shares.findIndex(
      (s) => s && typeof s === 'object' && String((s as { memberId?: string }).memberId) === params.memberUid
    );
    if (idx < 0) throw new Error('You are not on this split.');
    const leaving = shares[idx] as {
      invitePending?: boolean;
      displayName?: string;
      amountCents?: number;
    };
    if (leaving.invitePending === true) throw new Error('Accept or decline the invite before leaving.');

    const leaverName =
      typeof leaving.displayName === 'string' && leaving.displayName.trim()
        ? leaving.displayName.trim()
        : 'Member';
    const leaverShareCents =
      typeof leaving.amountCents === 'number' && Number.isFinite(leaving.amountCents)
        ? Math.round(leaving.amountCents)
        : 0;

    shares.splice(idx, 1);

    const rawMembers = data.members;
    let membersRoster: SubscriptionMemberRosterRow[] | string[];
    if (isObjectRoster(rawMembers)) {
      membersRoster = (rawMembers as Record<string, unknown>[]).map((m) => ({
        ...(m as SubscriptionMemberRosterRow),
      })) as SubscriptionMemberRosterRow[];
      const mi = membersRoster.findIndex((m) => m && m.uid === params.memberUid);
      if (mi >= 0) {
        membersRoster[mi] = {
          ...membersRoster[mi],
          memberStatus: 'left',
          leftAt: Timestamp.now(),
        };
      }
    } else {
      membersRoster = Array.isArray(rawMembers) ? [...(rawMembers as string[])] : [];
    }

    let memberUids = Array.isArray(data.memberUids) ? [...data.memberUids] : [];
    memberUids = memberUids.filter((u) => u !== params.memberUid);

    let activeMemberUids = Array.isArray(data.activeMemberUids) ? [...data.activeMemberUids] : [];
    activeMemberUids = activeMemberUids.filter((u) => u !== params.memberUid);

    const mps = { ...((data.memberPaymentStatus as Record<string, string> | undefined) ?? {}) };
    delete mps[params.memberUid];

    const totalCents = getTotalCents(data);
    const splitMethod = typeof data.splitMethod === 'string' ? data.splitMethod : 'equal';

    let customSplitNeedsRebalance = false;
    let nextShares: Record<string, unknown>[] = shares as Record<string, unknown>[];

    if (
      splitMethod === 'custom_percent' ||
      splitMethod === 'fixed_amount' ||
      splitMethod === 'fixed'
    ) {
      customSplitNeedsRebalance = true;
    } else {
      nextShares = redistributeActiveShares(shares as Record<string, unknown>[], totalCents, splitMethod);
    }

    if (isObjectRoster(rawMembers)) {
      membersRoster = syncRosterWithShares(
        membersRoster as SubscriptionMemberRosterRow[],
        nextShares
      ) as SubscriptionMemberRosterRow[];
    }

    const pendingInvites = (nextShares as { invitePending?: boolean }[]).some(
      (s) => s && s.invitePending
    );
    const syncedShares = pendingInvites
      ? syncOwnerShareForPendingInvites(
          nextShares,
          totalCents,
          isObjectRoster(rawMembers) ? (membersRoster as SubscriptionMemberRosterRow[]) : undefined
        )
      : nextShares;

    const updatePayload: Record<string, unknown> = {
      splitMemberShares: syncedShares,
      memberUids,
      memberPaymentStatus: mps,
      splitUpdatedAt: serverTimestamp(),
      leaveVoluntaryUid: params.memberUid,
      ownerMemberLeftBanner: {
        leaverDisplayName: leaverName,
        shareCents: leaverShareCents,
      },
      customSplitNeedsRebalance,
    };

    if (isObjectRoster(rawMembers)) {
      updatePayload.members = membersRoster;
      updatePayload.activeMemberUids = activeMemberUids;
    } else {
      updatePayload.members = membersRoster;
    }

    tx.update(subRef, updatePayload);
  });
}
