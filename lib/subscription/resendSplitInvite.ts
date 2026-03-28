import { doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { createPendingInvite, expirePendingInvite } from '../friends/friendSystemFirestore';
import { getFirebaseFirestore } from '../firebase';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function resendSplitInvite(opts: {
  subscriptionId: string;
  ownerUid: string;
  oldInviteId: string;
  memberId: string;
  recipientEmailRaw?: string | null;
}): Promise<string> {
  await expirePendingInvite(opts.oldInviteId);
  const newId = await createPendingInvite({
    creatorUid: opts.ownerUid,
    splitId: opts.subscriptionId,
    recipientEmailRaw: opts.recipientEmailRaw ?? undefined,
    connectedVia: 'split_invite',
  });

  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const subRef = doc(db, 'subscriptions', opts.subscriptionId);
  const snap = await getDoc(subRef);
  if (!snap.exists()) throw new Error('Subscription not found.');

  const data = snap.data() as Record<string, unknown>;
  const shares = Array.isArray(data.splitMemberShares)
    ? (data.splitMemberShares as Record<string, unknown>[]).map((s) => ({ ...s }))
    : [];
  const idx = shares.findIndex((s) => s && String(s.memberId ?? '') === opts.memberId);
  if (idx < 0) throw new Error('Member row not found.');

  shares[idx] = {
    ...shares[idx],
    inviteId: newId,
    inviteExpiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
  };

  await updateDoc(subRef, {
    splitMemberShares: shares,
    splitUpdatedAt: serverTimestamp(),
  });

  return newId;
}
