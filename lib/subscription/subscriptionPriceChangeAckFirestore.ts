import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/**
 * Records that this user dismissed the price-change banner for a subscription.
 * Other members are unaffected until they dismiss individually.
 *
 * Uses a dotted field path so other keys under `lastSeenPriceChangeBySubscription` are preserved.
 * Requires `users/{uid}` to exist (normal after sign-up / profile bootstrap).
 */
export async function acknowledgeSubscriptionPriceChange(
  uid: string,
  subscriptionId: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const field = `lastSeenPriceChangeBySubscription.${subscriptionId}`;
  await updateDoc(doc(db, 'users', uid), {
    [field]: serverTimestamp(),
  });
}
