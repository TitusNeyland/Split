import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import {
  ACTIVITY_FEED_PAGE_SIZE,
  type ActivityEvent,
  type ActivityEventFirestoreData,
} from './activityFeedSchema';

export function getActivityFeedCollectionRef(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'activity');
}

/** First page: newest first. */
export function activityFeedFirstPageQuery(db: Firestore, uid: string) {
  return query(
    getActivityFeedCollectionRef(db, uid),
    orderBy('createdAt', 'desc'),
    limit(ACTIVITY_FEED_PAGE_SIZE)
  );
}

/** Next page after a document from the previous query snapshot. */
export function activityFeedNextPageQuery(
  db: Firestore,
  uid: string,
  lastDoc: QueryDocumentSnapshot
) {
  return query(
    getActivityFeedCollectionRef(db, uid),
    orderBy('createdAt', 'desc'),
    startAfter(lastDoc),
    limit(ACTIVITY_FEED_PAGE_SIZE)
  );
}

export function parseActivityEventDoc(d: QueryDocumentSnapshot): ActivityEvent | null {
  const data = d.data() as Partial<ActivityEventFirestoreData> | undefined;
  if (!data || typeof data.type !== 'string' || !data.createdAt) return null;
  return {
    ...data,
    id: d.id,
  } as ActivityEvent;
}

/**
 * Live listener for the first page of the activity feed (newest first).
 * Matches: `orderBy('createdAt', 'desc'), limit(50)`.
 */
export function subscribeActivityFeed(
  uid: string,
  onUpdate: (events: ActivityEvent[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const q = activityFeedFirstPageQuery(db, uid);
  return onSnapshot(
    q,
    (snapshot) => {
      const events: ActivityEvent[] = [];
      for (const doc of snapshot.docs) {
        const row = parseActivityEventDoc(doc);
        if (row) events.push(row);
      }
      onUpdate(events);
    },
    (err) => {
      if (onError) onError(err);
      else onUpdate([]);
    }
  );
}

/** Use the last document from a snapshot as the cursor for `activityFeedNextPageQuery`. */
export function lastQueryDocFromSnapshot(
  snapshot: { docs: QueryDocumentSnapshot[] } | null | undefined
): QueryDocumentSnapshot | null {
  const docs = snapshot?.docs;
  if (!docs?.length) return null;
  return docs[docs.length - 1] ?? null;
}

export type { QueryDocumentSnapshot };
