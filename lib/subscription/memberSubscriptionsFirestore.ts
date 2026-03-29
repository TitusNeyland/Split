import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import {
  isViewerAcceptedActiveMember,
  subscriptionEndedAtMillis,
} from './subscriptionToCardModel';

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

function sortEndedSubsDesc(docs: MemberSubscriptionDoc[]): MemberSubscriptionDoc[] {
  return [...docs].sort((a, b) => {
    const ma = subscriptionEndedAtMillis(a.endedAt) ?? 0;
    const mb = subscriptionEndedAtMillis(b.endedAt) ?? 0;
    return mb - ma;
  });
}

function mergeEndedSubscriptions(a: MemberSubscriptionDoc[], b: MemberSubscriptionDoc[]): MemberSubscriptionDoc[] {
  return sortEndedSubsDesc(mergeById(a, b));
}

/**
 * Active subscriptions the viewer participates in as an accepted member only.
 * Uses `activeMemberUids` + `memberUids` (legacy) with `status === 'active'`, merged and
 * filtered by {@link isViewerAcceptedActiveMember} so pending invitees never appear.
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

  let fromActiveMemberUids: MemberSubscriptionDoc[] = [];
  let fromMemberUids: MemberSubscriptionDoc[] = [];
  let fromMembers: MemberSubscriptionDoc[] = [];
  let first1 = false;
  let first2 = false;
  let first3 = false;

  const emit = () => {
    const loading = !first1 || !first2 || !first3;
    const merged = mergeById(mergeById(fromActiveMemberUids, fromMemberUids), fromMembers);
    const acceptedOnly = merged.filter((d) => isViewerAcceptedActiveMember(d, uid));
    onUpdate(acceptedOnly, loading);
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
        fromActiveMemberUids = snap.docs.map((d) => docFromSnapshot(d));
        first1 = true;
        emit();
      },
      () => {
        fromActiveMemberUids = [];
        first1 = true;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      qMemberUids,
      (snap) => {
        fromMemberUids = snap.docs.map((d) => docFromSnapshot(d));
        first2 = true;
        emit();
      },
      () => {
        fromMemberUids = [];
        first2 = true;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      qMembers,
      (snap) => {
        fromMembers = snap.docs.map((d) => docFromSnapshot(d));
        first3 = true;
        emit();
      },
      () => {
        fromMembers = [];
        first3 = true;
        emit();
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

/**
 * Ended splits for the current user, ordered by `endedAt` descending.
 * Uses `memberUids` and legacy `members` array-contains (merged), matching {@link subscribeMemberSubscriptions}.
 */
export function subscribeEndedMemberSubscriptions(
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
    onUpdate(mergeEndedSubscriptions(fromMemberUids, fromMembers), loading);
  };

  /** No `orderBy(endedAt)` here: Firestore omits docs missing `endedAt`, and we sort client-side. */
  const qEndedUids = query(
    collection(db, 'subscriptions'),
    where('memberUids', 'array-contains', uid),
    where('status', '==', 'ended')
  );
  const qEndedMembers = query(
    collection(db, 'subscriptions'),
    where('members', 'array-contains', uid),
    where('status', '==', 'ended')
  );

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      qEndedUids,
      (snap) => {
        fromMemberUids = snap.docs.map((d) => docFromSnapshot(d));
        first1 = true;
        emit();
      },
      (err) => {
        console.warn('subscribeEndedMemberSubscriptions memberUids query failed:', err);
        fromMemberUids = [];
        first1 = true;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      qEndedMembers,
      (snap) => {
        fromMembers = snap.docs.map((d) => docFromSnapshot(d));
        first2 = true;
        emit();
      },
      (err) => {
        console.warn('subscribeEndedMemberSubscriptions members query failed:', err);
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
