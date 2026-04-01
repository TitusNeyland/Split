import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/**
 * Firestore shape:
 * - `users/{uid}.stats.lifetimeCollected` — integer cents (maintained when payments are confirmed)
 * - friendships: `users` array-contains current uid
 */
export type ProfileStatsLoading = {
  collectedTotal: boolean;
  friends: boolean;
};

export type ProfileStats = {
  /** Lifetime total received as split owner (cents). */
  collectedTotalCents: number;
  friends: number;
  loading: ProfileStatsLoading;
};

function emptyStats(loadingAll: boolean): ProfileStats {
  return {
    collectedTotalCents: 0,
    friends: 0,
    loading: {
      collectedTotal: loadingAll,
      friends: loadingAll,
    },
  };
}

function readLifetimeCollectedCents(data: Record<string, unknown>): number {
  const stats = data.stats;
  if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
    const v = (stats as { lifetimeCollected?: unknown }).lifetimeCollected;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  }
  return 0;
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
      collectedTotalCents: data.collectedTotalCents,
      friends: data.friends,
      loading: { ...data.loading },
    });
  };

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        data.collectedTotalCents = readLifetimeCollectedCents(raw);
        data.loading.collectedTotal = false;
        emit();
      },
      () => {
        data.collectedTotalCents = 0;
        data.loading.collectedTotal = false;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'friendships'), where('users', 'array-contains', uid)),
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
