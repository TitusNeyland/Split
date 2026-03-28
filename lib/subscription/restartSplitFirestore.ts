import { deleteField, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase';

function buildRestartMemberPaymentStatus(data: Record<string, unknown>): Record<string, string> {
  const shares = data.splitMemberShares;
  const out: Record<string, string> = {};
  if (!Array.isArray(shares)) return out;
  for (const row of shares) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { memberId?: string; role?: string; invitePending?: boolean };
    const id = String(r.memberId ?? '');
    if (!id) continue;
    if (r.role === 'owner') out[id] = 'owner';
    else if (r.invitePending) out[id] = 'invited_pending';
    else out[id] = 'pending';
  }
  return out;
}

export async function restartSubscriptionSplit(params: {
  subscriptionId: string;
  restartedByUid: string;
  ownerDisplayName: string;
  subscriptionDisplayName: string;
  /** Members to notify (typically everyone else on the split). */
  recipientUids: string[];
  nextBillingDateLabel: string;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const ref = doc(db, 'subscriptions', params.subscriptionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Subscription not found.');
  const data = snap.data() as Record<string, unknown>;

  const memberPaymentStatus = buildRestartMemberPaymentStatus(data);

  await updateDoc(ref, {
    status: 'active',
    restartedAt: serverTimestamp(),
    restartedBy: params.restartedByUid,
    endedAt: deleteField(),
    endedBy: deleteField(),
    memberPaymentStatus,
  });

  const fns = getFirebaseFunctions();
  if (!fns || params.recipientUids.length === 0) return;

  const title = `${params.ownerDisplayName} restarted the ${params.subscriptionDisplayName} split · next billing ${params.nextBillingDateLabel}`;
  try {
    const notify = httpsCallable<
      { subscriptionId: string; recipientUids: string[]; title: string; body: string },
      unknown
    >(fns, 'notifySplitRestarted');
    await notify({
      subscriptionId: params.subscriptionId,
      recipientUids: params.recipientUids,
      title,
      body: title,
    });
  } catch (e) {
    console.warn('notifySplitRestarted:', e);
  }
}
