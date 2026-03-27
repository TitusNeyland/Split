import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

export type MemberSubscriptionDoc = { id: string } & Record<string, unknown>;

function docFromSnapshot(d: { id: string; data: () => Record<string, unknown> }): MemberSubscriptionDoc {
  return { id: d.id, ...d.data() } as MemberSubscriptionDoc;
}

function mergeById(a: MemberSubscriptionDoc[], b: MemberSubscriptionDoc[]): MemberSubscriptionDoc[] {
  const map = new Map<string, MemberSubscriptionDoc>();
  for (const doc of a) {
    map.set(doc.id, doc);
  }
  for (const doc of b) {
    const prev = map.get(doc.id);
    if (prev) {
      map.set(doc.id, { ...prev, ...doc });
    } else {
      map.set(doc.id, doc);
    }
  }
  return [...map.values()];
}

/**
 * Subscriptions where the user appears in `memberUids` or `members` (uid strings).
 * Two listeners are merged so legacy docs and new `memberUids` field both resolve.
 */
export function subscribeMemberSubscriptions(
  uid: string | null | undefined,
  onUpdate: (subs: MemberSubscriptionDoc[], loading: boolean) => void
): () => void {
  if (!uid) {
    onUpdate([], false);
    return () => {};
  }
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate([], false);
    return () => {};
  }

  let fromMemberUids: MemberSubscriptionDoc[] = [];
  let fromMembers: MemberSubscriptionDoc[] = [];
  let first1 = false;
  let first2 = false;

  const emit = () => {
    const loading = !first1 || !first2;
    onUpdate(mergeById(fromMemberUids, fromMembers), loading);
  };

  const qMemberUids = query(collection(db, 'subscriptions'), where('memberUids', 'array-contains', uid));
  const qMembers = query(collection(db, 'subscriptions'), where('members', 'array-contains', uid));

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      qMemberUids,
      (snap) => {
        fromMemberUids = snap.docs.map((d) => docFromSnapshot(d));
        first1 = true;
        emit();
      },
      () => {
        fromMemberUids = [];
        first1 = true;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      qMembers,
      (snap) => {
        fromMembers = snap.docs.map((d) => docFromSnapshot(d));
        first2 = true;
        emit();
      },
      () => {
        fromMembers = [];
        first2 = true;
        emit();
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}
