import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import type { ActivityEvent } from './activityFeedSchema';
import { shouldSkipSubscriptionExistenceValidation } from './activityStaleSubscription';

export type StaleSubscriptionValidationResult = {
  invalidSubscriptionIds: Set<string>;
};

/**
 * Loads each distinct subscription id and returns ids that are missing or not active.
 * Skips event types that are informational only (split ended / removed / left).
 */
export async function collectInvalidSubscriptionIds(
  events: ActivityEvent[]
): Promise<StaleSubscriptionValidationResult> {
  const db = getFirebaseFirestore();
  if (!db) return { invalidSubscriptionIds: new Set() };

  const subIds = [
    ...new Set(
      events
        .filter(
          (e) =>
            typeof e.subscriptionId === 'string' &&
            e.subscriptionId.trim() &&
            !e.subscriptionDeleted &&
            !shouldSkipSubscriptionExistenceValidation(e.type)
        )
        .map((e) => e.subscriptionId!.trim())
    ),
  ];

  if (subIds.length === 0) return { invalidSubscriptionIds: new Set() };

  const invalidSubscriptionIds = new Set<string>();
  await Promise.all(
    subIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'subscriptions', id));
        const status = snap.exists()
          ? String((snap.data() as { status?: string }).status ?? 'active').toLowerCase()
          : '';
        if (!snap.exists() || status !== 'active') {
          invalidSubscriptionIds.add(id);
        }
      } catch (error) {
        // If we can't read the subscription (e.g., permission denied because user is no longer
        // a member), treat it as "valid" and don't mark the activity as stale. This gracefully
        // handles the case where activity events reference subscriptions the user is no longer
        // a member of (split left, invite declined, removed from group, etc.).
        console.debug(`Failed to validate subscription ${id}:`, error);
      }
    })
  );

  return { invalidSubscriptionIds };
}

/**
 * Writes `subscriptionDeleted: true` on the current user's activity docs for the given subscription ids.
 * Requires Firestore rules to allow this field on `users/{uid}/activity/*` updates.
 */
export async function markActivityDocsSubscriptionDeleted(
  uid: string,
  subscriptionIds: string[],
  dbParam?: Firestore
): Promise<void> {
  if (!subscriptionIds.length) return;
  const db = dbParam ?? getFirebaseFirestore();
  if (!db) return;

  for (const subId of subscriptionIds) {
    const q = query(
      collection(db, 'users', uid, 'activity'),
      where('subscriptionId', '==', subId)
    );
    const snap = await getDocs(q);
    if (snap.empty) continue;

    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      const slice = snap.docs.slice(i, i + 400);
      for (const d of slice) {
        batch.update(d.ref, { subscriptionDeleted: true });
      }
      await batch.commit();
    }
  }
}
