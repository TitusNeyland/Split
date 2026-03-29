import { deleteField, doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { createPendingInvite, expirePendingInvite } from '../friends/friendSystemFirestore';
import { getFirebaseFirestore } from '../firebase';
import { syncOwnerShareForPendingInvites, type SubscriptionMemberRosterRow } from './subscriptionSplitRecalc';

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
    invitePending: true,
    inviteExpired: deleteField(),
    inviteExpiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
  };

  const patch: Record<string, unknown> = {
    splitUpdatedAt: serverTimestamp(),
  };

  const mem = data.members;
  let rosterForSync: SubscriptionMemberRosterRow[] | undefined;
  if (Array.isArray(mem) && mem.length > 0 && typeof mem[0] === 'object' && mem[0] !== null) {
    const roster = (mem as Record<string, unknown>[]).map((row) => ({ ...row }));
    const mi = roster.findIndex((m) => String((m as { uid?: string }).uid ?? '') === opts.memberId);
    if (mi >= 0) {
      roster[mi] = {
        ...roster[mi],
        inviteId: newId,
        memberStatus: 'pending',
        invitedAt: Timestamp.now(),
        inviteExpiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
      };
      patch.members = roster;
      rosterForSync = roster as SubscriptionMemberRosterRow[];
    }
  }

  const totalCents =
    typeof data.totalCents === 'number' && Number.isFinite(data.totalCents) ? Math.round(data.totalCents) : 0;
  const syncedShares = syncOwnerShareForPendingInvites(
    shares as Record<string, unknown>[],
    totalCents,
    rosterForSync
  );
  patch.splitMemberShares = syncedShares;

  await updateDoc(subRef, patch);

  return newId;
}
