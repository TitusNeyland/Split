import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

/**
 * Badge counts for the Subscriptions filter row. Listeners stay active so switching
 * tabs does not show a loading state.
 *
 * Firestore shape (add composite indexes if the console prompts):
 * - `payments`: `status` == "overdue" AND `owner` == uid — `owner` is the subscription
 *   bill payer (current user). Rename the field here if your schema uses another name.
 * - `subscriptions`: `members` array-contains uid AND `status` == "paused"
 */
export type SubscriptionTabBadgeCounts = {
  overdue: number;
  paused: number;
};

const PAYMENT_OWNER_FIELD = 'owner' as const;

function empty(): SubscriptionTabBadgeCounts {
  return { overdue: 0, paused: 0 };
}

export function subscribeSubscriptionTabBadgeCounts(
  uid: string,
  onUpdate: (counts: SubscriptionTabBadgeCounts) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate(empty());
    return () => {};
  }

  const counts: SubscriptionTabBadgeCounts = { overdue: 0, paused: 0 };
  let alive = true;

  const emit = () => {
    if (!alive) return;
    onUpdate({ ...counts });
  };

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'payments'),
        where('status', '==', 'overdue'),
        where(PAYMENT_OWNER_FIELD, '==', uid)
      ),
      (snap) => {
        counts.overdue = snap.size;
        emit();
      },
      () => {
        counts.overdue = 0;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'subscriptions'),
        where('members', 'array-contains', uid),
        where('status', '==', 'paused')
      ),
      (snap) => {
        counts.paused = snap.size;
        emit();
      },
      () => {
        counts.paused = 0;
        emit();
      }
    )
  );

  emit();

  return () => {
    alive = false;
    unsubs.forEach((u) => u());
  };
}
