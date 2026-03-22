import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirebaseFirestore } from './firebase';

/**
 * Reads `users/{uid}.lifetime_saved` (dollars, number) and `createdAt` for tenure.
 * If `createdAt` is missing, falls back to Firebase Auth `metadata.creationTime` when `authUser` is passed.
 */
export type HomeSavingsSnapshot = {
  lifetimeSaved: number;
  joinedAt: Date | null;
};

function readLifetimeSaved(data: Record<string, unknown>): number {
  const v = data.lifetime_saved;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  return 0;
}

function readJoinedAt(data: Record<string, unknown>, authUser: User | null): Date | null {
  const c = data.createdAt as { toDate?: () => Date } | undefined;
  if (c?.toDate) {
    const d = c.toDate();
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  if (authUser?.metadata?.creationTime) {
    const d = new Date(authUser.metadata.creationTime);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatMemberTenureMonths(joinedAt: Date | null): string {
  if (!joinedAt || Number.isNaN(joinedAt.getTime())) return '—';
  const now = new Date();
  let months =
    (now.getFullYear() - joinedAt.getFullYear()) * 12 + (now.getMonth() - joinedAt.getMonth());
  if (now.getDate() < joinedAt.getDate()) months -= 1;
  months = Math.max(0, months);
  if (months < 1) return '< 1 month';
  if (months === 1) return '1 month';
  return `${months} months`;
}

export function subscribeHomeSavings(
  uid: string,
  authUser: User | null,
  onUpdate: (s: HomeSavingsSnapshot) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate({ lifetimeSaved: 0, joinedAt: null });
    return () => {};
  }

  const ref = doc(db, 'users', uid);
  const unsub: Unsubscribe = onSnapshot(
    ref,
    (snap) => {
      const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
      onUpdate({
        lifetimeSaved: readLifetimeSaved(raw),
        joinedAt: readJoinedAt(raw, authUser),
      });
    },
    () => {
      onUpdate({ lifetimeSaved: 0, joinedAt: readJoinedAt({}, authUser) });
    }
  );

  return unsub;
}
