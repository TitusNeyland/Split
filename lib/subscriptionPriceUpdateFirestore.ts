import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

/**
 * Call when the subscription owner changes the billed total. Sets `priceChangedAt` and
 * from/to cents so members see the amber banner until they dismiss or the cycle auto-clears.
 * Per-person UI should use `newCents` with the current split immediately.
 */
export async function recordSubscriptionPriceChange(opts: {
  subscriptionId: string;
  previousCents: number;
  newCents: number;
  /** Optional; enables auto-dismiss after the following billing anchor. */
  billingDayOfMonth?: number;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const ref = doc(db, 'subscriptions', opts.subscriptionId);
  const patch: Record<string, unknown> = {
    priceChangeFromCents: opts.previousCents,
    priceChangeToCents: opts.newCents,
    priceChangedAt: serverTimestamp(),
    amountCents: opts.newCents,
  };
  if (opts.billingDayOfMonth != null) {
    patch.billingDayOfMonth = opts.billingDayOfMonth;
  }
  await updateDoc(ref, patch);
}
