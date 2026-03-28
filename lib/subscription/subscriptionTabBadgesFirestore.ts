import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/**
 * Live data for Subscriptions filter tabs. All listeners start when the screen mounts so
 * switching tabs never triggers new loads or loading UI.
 *
 * Firestore (add composite indexes if prompted):
 * - `payments`: `status` == "overdue" AND `owner` == uid (subscription bill owner = current user).
 *   Adjust `PAYMENT_OWNER_FIELD` if your schema differs.
 * - `subscriptions`: `members` array-contains uid AND `status` (active | ended; legacy paused/archived/cancelled)
 */
export type SubscriptionTabBadgeCounts = {
  overdue: number;
};

export type SubscriptionsTabPrefetchState = SubscriptionTabBadgeCounts & {
  /** Member subscriptions with status "active". */
  active: number;
  /** Member subscriptions with status "ended" (legacy archived / cancelled / paused). */
  ended: number;
};

const PAYMENT_OWNER_FIELD = 'owner' as const;

function emptyState(): SubscriptionsTabPrefetchState {
  return { overdue: 0, active: 0, ended: 0 };
}

export function subscribeSubscriptionsTabPrefetch(
  uid: string,
  onUpdate: (state: SubscriptionsTabPrefetchState) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate(emptyState());
    return () => {};
  }

  const state = emptyState();
  let alive = true;

  const emit = () => {
    if (!alive) return;
    onUpdate({ ...state });
  };

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'subscriptions'),
        where('members', 'array-contains', uid),
        where('status', '==', 'active')
      ),
      (snap) => {
        state.active = snap.size;
        emit();
      },
      () => {
        state.active = 0;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'payments'),
        where('status', '==', 'overdue'),
        where(PAYMENT_OWNER_FIELD, '==', uid)
      ),
      (snap) => {
        state.overdue = snap.size;
        emit();
      },
      () => {
        state.overdue = 0;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'subscriptions'),
        where('members', 'array-contains', uid),
        where('status', 'in', ['ended', 'archived', 'cancelled', 'paused'])
      ),
      (snap) => {
        state.ended = snap.size;
        emit();
      },
      () => {
        state.ended = 0;
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
