import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

/**
 * Firestore shape (create composite indexes as prompted by the SDK):
 * - subscriptions: members (array-contains) + status == "active"
 * - payments: recipient == uid + status == "paid" (documents use numeric `amount` in dollars)
 * - users/{uid}/friendships: one doc per connected friend
 */
export type ProfileStatsLoading = {
  activeSplits: boolean;
  collectedTotal: boolean;
  friends: boolean;
};

export type ProfileStats = {
  activeSplits: number;
  collectedTotal: number;
  friends: number;
  loading: ProfileStatsLoading;
};

function emptyStats(loadingAll: boolean): ProfileStats {
  return {
    activeSplits: 0,
    collectedTotal: 0,
    friends: 0,
    loading: {
      activeSplits: loadingAll,
      collectedTotal: loadingAll,
      friends: loadingAll,
    },
  };
}

function sumPaymentAmounts(docs: { data: () => Record<string, unknown> }[]): number {
  let total = 0;
  for (const d of docs) {
    const x = d.data();
    const a = x.amount;
    if (typeof a === 'number' && Number.isFinite(a)) total += a;
  }
  return total;
}

export function subscribeProfileStats(uid: string, onUpdate: (stats: ProfileStats) => void): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate(emptyStats(false));
    return () => {};
  }

  const data: ProfileStats = emptyStats(true);
  let alive = true;

  const emit = () => {
    if (!alive) return;
    onUpdate({
      activeSplits: data.activeSplits,
      collectedTotal: data.collectedTotal,
      friends: data.friends,
      loading: { ...data.loading },
    });
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
        data.activeSplits = snap.size;
        data.loading.activeSplits = false;
        emit();
      },
      () => {
        data.activeSplits = 0;
        data.loading.activeSplits = false;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'payments'), where('recipient', '==', uid), where('status', '==', 'paid')),
      (snap) => {
        data.collectedTotal = sumPaymentAmounts(snap.docs);
        data.loading.collectedTotal = false;
        emit();
      },
      () => {
        data.collectedTotal = 0;
        data.loading.collectedTotal = false;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', uid, 'friendships'),
      (snap) => {
        data.friends = snap.size;
        data.loading.friends = false;
        emit();
      },
      () => {
        data.friends = 0;
        data.loading.friends = false;
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
