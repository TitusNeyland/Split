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
import { activityEventToFeedRow, type ActivityFeedKind } from '../activity/activityEventToFeedItem';
import type { ActivityEvent } from '../activity/activityFeedSchema';
import { filterActivityEventsForFeed } from '../activity/activityStaleSubscription';
import type { ActivityEventType } from '../activity/activityFeedSchema';

const HOME_RECENT_LIMIT = 3;

export type HomeRecentActivityFirestoreItem = {
  id: string;
  title: string;
  timestamp: string;
  /** Monetary amount line when present; status chip is always `badgeLabel`. */
  amount?: string;
  amountColor: string;
  badgeLabel: string;
  activityType: ActivityEventType;
  kind: ActivityFeedKind;
  serviceMark?: string;
  serviceId?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  friendAvatar?: { initials: string; imageUrl?: string | null; uid?: string };
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
      const visible = filterActivityEventsForFeed(
        snap.docs.map((d) => parseActivityEventDoc(d)).filter((e): e is ActivityEvent => e != null)
      );
      for (const ev of visible) {
        const row = activityEventToFeedRow(ev as ActivityEvent, uid);
        if (!row) continue;
        items.push({
          id: row.id,
          title: row.title,
          timestamp: row.time,
          amount: row.amount?.trim() || undefined,
          amountColor: row.amountColor,
          badgeLabel: row.badge,
          activityType: ev.type,
          kind: row.kind,
          serviceMark: row.serviceMark,
          serviceId: row.serviceId,
          icon: row.icon,
          iconBg: row.iconBg,
          iconColor: row.iconColor,
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
