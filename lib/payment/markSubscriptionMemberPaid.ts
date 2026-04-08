import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/**
 * Mark the current user's share for a subscription as manually paid.
 * Updates both the legacy `memberPaymentStatus` map and the `members[]` roster array.
 */
export async function markSubscriptionMemberPaid(
  subscriptionId: string,
  memberUid: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firebase is not configured.');

  const subRef = doc(db, 'subscriptions', subscriptionId);
  const snap = await getDoc(subRef);
  if (!snap.exists()) throw new Error('Subscription not found.');

  const data = snap.data() as Record<string, unknown>;

  // Update legacy memberPaymentStatus map
  const mps = { ...((data.memberPaymentStatus as Record<string, string> | undefined) ?? {}) };
  mps[memberUid] = 'paid';

  const updatePayload: Record<string, unknown> = {
    memberPaymentStatus: mps,
    paidUpdatedAt: serverTimestamp(),
  };

  // Update members[] if object-roster format
  const rawMembers = data.members;
  if (
    Array.isArray(rawMembers) &&
    rawMembers.length > 0 &&
    rawMembers[0] != null &&
    typeof rawMembers[0] === 'object'
  ) {
    const now = serverTimestamp();
    updatePayload.members = (rawMembers as Record<string, unknown>[]).map((m) => {
      if (!m || typeof m !== 'object') return m;
      if ((m as { uid?: string }).uid !== memberUid) return m;
      return { ...m, paymentStatus: 'paid', paidAt: now };
    });
  }

  await updateDoc(subRef, updatePayload);
}
