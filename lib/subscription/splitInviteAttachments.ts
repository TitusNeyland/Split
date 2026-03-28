import { doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { createPendingInvite } from '../friends/friendSystemFirestore';
import { getFirebaseFirestore } from '../firebase';
import { persistMemberId, type CreateSubscriptionWizardInput } from './createSubscriptionWizardFirestore';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * After `createSubscriptionFromWizard`, creates `invites` docs with `splitId` and patches
 * `splitMemberShares` with `inviteId` + `inviteExpiresAt` for each pending (not-on-app) member.
 */
export async function attachSplitInvitesToSubscription(
  subscriptionId: string,
  input: CreateSubscriptionWizardInput
): Promise<string[]> {
  const pending = input.members.filter((m) => m.role !== 'owner' && m.invitePending);
  if (pending.length === 0) return [];

  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const subRef = doc(db, 'subscriptions', subscriptionId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('Subscription not found.');

  const data = subSnap.data() as Record<string, unknown>;
  const shares = Array.isArray(data.splitMemberShares)
    ? (data.splitMemberShares as Record<string, unknown>[]).map((s) => ({ ...s }))
    : [];

  const createdIds: string[] = [];
  const inviteExpiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);

  for (const m of pending) {
    const memberId = persistMemberId(m, input.actorUid);
    const inviteId = await createPendingInvite({
      creatorUid: input.actorUid,
      splitId: subscriptionId,
      recipientEmailRaw: m.pendingInviteEmail?.trim() || undefined,
      connectedVia: 'split_invite',
    });
    createdIds.push(inviteId);

    const idx = shares.findIndex((s) => s && String(s.memberId ?? '') === memberId);
    if (idx >= 0) {
      shares[idx] = {
        ...shares[idx],
        inviteId,
        inviteExpiresAt,
      };
    }
  }

  await updateDoc(subRef, {
    splitMemberShares: shares,
    splitUpdatedAt: serverTimestamp(),
  });

  return createdIds;
}
