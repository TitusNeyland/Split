import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import { getTotalCents } from './subscriptionToCardModel';
import {
  normalizeSoloOwnerMemberRoster,
  syncOwnerShareForPendingInvites,
  type SubscriptionMemberRosterRow,
} from './subscriptionSplitRecalc';

/**
 * Owner removes a pending invite slot (share row + roster) and deletes the invite document.
 */
export async function removePendingSplitInvite(opts: {
  subscriptionId: string;
  ownerUid: string;
  inviteId: string;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const subRef = doc(db, 'subscriptions', opts.subscriptionId);
  const inviteRef = doc(db, 'invites', opts.inviteId);

  await runTransaction(db, async (tx) => {
    const subSnap = await tx.get(subRef);
    const inviteSnap = await tx.get(inviteRef);
    if (!subSnap.exists()) throw new Error('Subscription not found.');
    const data = subSnap.data() as Record<string, unknown>;
    if (String(data.ownerUid ?? '') !== opts.ownerUid) {
      throw new Error('Only the owner can remove this invite.');
    }

    const shares = Array.isArray(data.splitMemberShares) ? [...data.splitMemberShares] : [];
    const idx = shares.findIndex((s) => s && (s as { inviteId?: string }).inviteId === opts.inviteId);
    if (idx < 0) throw new Error('Invite slot not found.');

    const oldShare = shares[idx] as { memberId?: string; invitePending?: boolean; inviteExpired?: boolean };
    const isUnfilledInviteSlot =
      oldShare.invitePending === true || oldShare.inviteExpired === true;
    if (!isUnfilledInviteSlot) throw new Error('This row is not a pending or expired invite slot.');

    const oldMemberId = typeof oldShare.memberId === 'string' ? oldShare.memberId : '';
    shares.splice(idx, 1);

    const rawMembers = data.members;
    const firstM = Array.isArray(rawMembers) && rawMembers.length > 0 ? rawMembers[0] : undefined;
    const isObjectRoster = firstM !== undefined && typeof firstM === 'object' && firstM !== null;
    const totalCents = getTotalCents(data);
    const ownerUid = String(data.ownerUid ?? '');

    let membersRoster: SubscriptionMemberRosterRow[] | string[];
    if (isObjectRoster) {
      membersRoster = (rawMembers as Record<string, unknown>[]).map((m) => ({
        ...m,
      })) as SubscriptionMemberRosterRow[];
      const mIdx = membersRoster.findIndex((m) => m && m.inviteId === opts.inviteId);
      if (mIdx >= 0) membersRoster.splice(mIdx, 1);
      membersRoster = normalizeSoloOwnerMemberRoster(
        membersRoster as SubscriptionMemberRosterRow[],
        totalCents,
        ownerUid
      ) as SubscriptionMemberRosterRow[];
    } else {
      membersRoster = Array.isArray(rawMembers) ? ([...rawMembers] as string[]) : [];
      const mIdx = membersRoster.findIndex((u) => u === oldMemberId);
      if (mIdx >= 0) membersRoster.splice(mIdx, 1);
    }

    let memberUids = Array.isArray(data.memberUids) ? [...data.memberUids] : [];
    memberUids = memberUids.filter((u) => u !== oldMemberId);

    let activeMemberUids = Array.isArray(data.activeMemberUids) ? [...data.activeMemberUids] : [];
    activeMemberUids = activeMemberUids.filter((u) => u !== oldMemberId);

    const mps = { ...((data.memberPaymentStatus as Record<string, string> | undefined) ?? {}) };
    delete mps[oldMemberId];

    const syncedShares = isObjectRoster
      ? syncOwnerShareForPendingInvites(
          shares as Record<string, unknown>[],
          totalCents,
          membersRoster as SubscriptionMemberRosterRow[]
        )
      : (shares as Record<string, unknown>[]);

    const updatePayload: Record<string, unknown> = {
      splitMemberShares: syncedShares,
      memberUids,
      memberPaymentStatus: mps,
      splitUpdatedAt: serverTimestamp(),
    };
    if (isObjectRoster) {
      updatePayload.members = membersRoster;
      updatePayload.activeMemberUids = activeMemberUids;
    } else {
      updatePayload.members = membersRoster;
    }

    tx.update(subRef, updatePayload);
    if (inviteSnap.exists()) {
      tx.delete(inviteRef);
    }
  });
}
