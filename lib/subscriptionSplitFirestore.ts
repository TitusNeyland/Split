import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

export type FirestoreSplitMethod = 'equal' | 'custom_percent' | 'fixed_amount';

export type FirestoreMemberShare = {
  memberId: string;
  /** Present for equal / custom_percent. */
  percent?: number;
  amountCents: number;
};

/**
 * Persists a split change that takes effect at the start of the next billing cycle
 * (`effectiveFrom`). Writes an audit entry under `subscriptions/{id}/split_change_log`.
 */
export async function saveSubscriptionSplitToFirestore(opts: {
  subscriptionId: string;
  actorUid: string;
  method: FirestoreSplitMethod;
  memberShares: FirestoreMemberShare[];
  effectiveFrom: Date;
  previousSnapshot?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const subRef = doc(db, 'subscriptions', opts.subscriptionId);
  const effectiveTs = Timestamp.fromDate(opts.effectiveFrom);

  await updateDoc(subRef, {
    splitMethod: opts.method,
    splitMemberShares: opts.memberShares,
    splitPendingEffectiveFrom: effectiveTs,
    splitUpdatedAt: serverTimestamp(),
  });

  await addDoc(collection(subRef, 'split_change_log'), {
    createdAt: serverTimestamp(),
    actorUid: opts.actorUid,
    method: opts.method,
    memberShares: opts.memberShares,
    effectiveFrom: effectiveTs,
    previousSnapshot: opts.previousSnapshot ?? null,
  });
}
