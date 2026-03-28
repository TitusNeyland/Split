import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

export type HomeRecentActivityFirestoreItem = {
  id: string;
  kind: 'payment' | 'reminder' | 'system';
  title: string;
  timestamp: string;
  amount: string;
  amountColor: string;
  serviceMark?: string;
};

function formatRelativeTime(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  if (!d || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const C = {
  green: '#1D9E75',
  orange: '#EF9F27',
  muted: '#888780',
};

function mapDoc(
  id: string,
  data: Record<string, unknown>
): HomeRecentActivityFirestoreItem | null {
  const title = typeof data.title === 'string' ? data.title : typeof data.body === 'string' ? data.body : '';
  if (!title.trim()) return null;
  const kindRaw = data.kind;
  const kind =
    kindRaw === 'reminder' ? 'reminder' : kindRaw === 'payment' ? 'payment' : 'system';
  const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
  const amountCents = typeof data.amountCents === 'number' ? data.amountCents : null;
  const amountStr =
    amountCents != null && Number.isFinite(amountCents)
      ? `${amountCents >= 0 ? '+' : ''}$${(Math.abs(amountCents) / 100).toFixed(2)}`
      : '';
  const serviceMark = typeof data.serviceName === 'string' ? data.serviceName : undefined;
  const amountColor =
    kind === 'payment' ? C.green : kind === 'reminder' ? C.orange : C.muted;

  return {
    id,
    kind,
    title: title.trim(),
    timestamp: formatRelativeTime(createdAt),
    amount: amountStr || '—',
    amountColor,
    serviceMark,
  };
}

/**
 * Recent activity from `users/{uid}/notifications` (requires Firestore rules + index on createdAt).
 */
export function subscribeHomeRecentActivity(
  uid: string,
  onUpdate: (items: HomeRecentActivityFirestoreItem[]) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(3)
  );

  let unsub: Unsubscribe;
  unsub = onSnapshot(
    q,
    (snap) => {
      const items: HomeRecentActivityFirestoreItem[] = [];
      for (const d of snap.docs) {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>);
        if (row) items.push(row);
      }
      onUpdate(items);
    },
    () => {
      onUpdate([]);
    }
  );

  return () => unsub();
}
