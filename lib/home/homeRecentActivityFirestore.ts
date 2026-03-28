import {
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import {
  getActivityFeedCollectionRef,
  parseActivityEventDoc,
} from '../activity/activityFeedFirestore';
import { activityEventToFeedRow } from '../activity/activityEventToFeedItem';
import type { ActivityEvent } from '../activity/activityFeedSchema';

const HOME_RECENT_LIMIT = 3;

export type HomeRecentActivityFirestoreItem = {
  id: string;
  title: string;
  timestamp: string;
  amount: string;
  amountColor: string;
  serviceMark?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  serviceIconMuted?: boolean;
  friendAvatar?: { initials: string; imageUrl?: string | null };
};

/**
 * Latest events from `users/{uid}/activity` — same collection as the Activity tab.
 * (Older implementation read `notifications`, which does not receive CF activity events.)
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
    getActivityFeedCollectionRef(db, uid),
    orderBy('createdAt', 'desc'),
    limit(HOME_RECENT_LIMIT)
  );

  let unsub: Unsubscribe;
  unsub = onSnapshot(
    q,
    (snap) => {
      const items: HomeRecentActivityFirestoreItem[] = [];
      for (const d of snap.docs) {
        const ev = parseActivityEventDoc(d);
        if (!ev) continue;
        const row = activityEventToFeedRow(ev as ActivityEvent, uid);
        if (!row) continue;
        const amountRight = row.amount?.trim() ? row.amount : row.badge;
        items.push({
          id: row.id,
          title: row.title,
          timestamp: row.time,
          amount: amountRight,
          amountColor: row.amountColor,
          serviceMark: row.serviceMark,
          icon: row.icon,
          iconBg: row.iconBg,
          iconColor: row.iconColor,
          serviceIconMuted: row.serviceIconMuted,
          friendAvatar: row.friendAvatar,
        });
      }
      onUpdate(items);
    },
    () => {
      onUpdate([]);
    }
  );

  return () => unsub();
}
