import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/** Clears owner-visible decline banners on a subscription (owner only; rules: memberUids). */
export async function clearSplitInviteDeclineNotices(subscriptionId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, 'subscriptions', subscriptionId), {
    splitInviteDeclineNotices: [],
    splitUpdatedAt: serverTimestamp(),
  });
}
