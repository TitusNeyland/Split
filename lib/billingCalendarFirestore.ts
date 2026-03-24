import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { mapFirestoreDocToCalendarSubscription, type BillingCalendarSubscription } from './billingCalendarModel';

export function subscribeBillingCalendarSubscriptions(
  uid: string,
  onUpdate: (subs: BillingCalendarSubscription[]) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, 'subscriptions'),
    where('members', 'array-contains', uid),
    where('status', '==', 'active')
  );

  let unsub: Unsubscribe | null = null;
  try {
    unsub = onSnapshot(
      q,
      (snap) => {
        const list: BillingCalendarSubscription[] = [];
        snap.forEach((docSnap) => {
          const row = mapFirestoreDocToCalendarSubscription(
            docSnap.id,
            docSnap.data() as Record<string, unknown>,
            uid
          );
          if (row) list.push(row);
        });
        onUpdate(list);
      },
      () => {
        onUpdate([]);
      }
    );
  } catch {
    onUpdate([]);
    return () => {};
  }

  return () => {
    unsub?.();
  };
}
