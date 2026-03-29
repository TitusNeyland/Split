import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import { isViewerAcceptedActiveMember } from './subscriptionToCardModel';
import { mapFirestoreDocToCalendarSubscription, type BillingCalendarSubscription } from './billingCalendarModel';

function mergeById(
  a: { id: string; data: Record<string, unknown> }[],
  b: { id: string; data: Record<string, unknown> }[]
): { id: string; data: Record<string, unknown> }[] {
  const map = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const x of a) map.set(x.id, x);
  for (const x of b) {
    const prev = map.get(x.id);
    map.set(x.id, prev ? { id: x.id, data: { ...prev.data, ...x.data } } : x);
  }
  return [...map.values()];
}

function mergeThree(
  a: { id: string; data: Record<string, unknown> }[],
  b: { id: string; data: Record<string, unknown> }[],
  c: { id: string; data: Record<string, unknown> }[]
): { id: string; data: Record<string, unknown> }[] {
  return mergeById(mergeById(a, b), c);
}

export function subscribeBillingCalendarSubscriptions(
  uid: string,
  onUpdate: (subs: BillingCalendarSubscription[]) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  let fromActive: { id: string; data: Record<string, unknown> }[] = [];
  let fromMemberUids: { id: string; data: Record<string, unknown> }[] = [];
  let fromMembers: { id: string; data: Record<string, unknown> }[] = [];

  const emit = () => {
    const merged = mergeThree(fromActive, fromMemberUids, fromMembers);
    const list: BillingCalendarSubscription[] = [];
    for (const { id, data } of merged) {
      if (!isViewerAcceptedActiveMember(data, uid)) continue;
      const row = mapFirestoreDocToCalendarSubscription(id, data, uid);
      if (row) list.push(row);
    }
    onUpdate(list);
  };

  const qActive = query(
    collection(db, 'subscriptions'),
    where('activeMemberUids', 'array-contains', uid),
    where('status', '==', 'active')
  );
  const qMemberUids = query(
    collection(db, 'subscriptions'),
    where('memberUids', 'array-contains', uid),
    where('status', '==', 'active')
  );
  const qMembers = query(
    collection(db, 'subscriptions'),
    where('members', 'array-contains', uid),
    where('status', '==', 'active')
  );

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      qActive,
      (snap) => {
        fromActive = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        emit();
      },
      () => {
        fromActive = [];
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      qMemberUids,
      (snap) => {
        fromMemberUids = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        emit();
      },
      () => {
        fromMemberUids = [];
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      qMembers,
      (snap) => {
        fromMembers = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        emit();
      },
      () => {
        fromMembers = [];
        emit();
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}
