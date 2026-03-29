import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import { initialsFromName } from '../profile';
import { getTotalCents } from '../subscription/subscriptionToCardModel';
import { computeFirstChargeObligationStartsNextCycle } from '../subscription/firstChargeObligation';
import {
  type SubscriptionMemberRosterRow,
  syncOwnerShareForPendingInvites,
} from '../subscription/subscriptionSplitRecalc';
import { acceptPendingInvite, declinePendingInvite } from '../friends/friendSystemFirestore';

export type NotificationDocType =
  | 'split_invite'
  | 'split_invite_declined_by_member'
  | 'split_invite_expired'
  | 'friend_connected'
  | 'payment_received'
  | 'payment_overdue'
  | 'payment_failed'
  | string;

export type SplitInviteMetadata = {
  inviterUid: string;
  inviterName: string;
  inviterAvatarUrl: string | null;
  subscriptionId: string;
  subscriptionName: string;
  serviceId: string;
  userShare: number;
  billingCycle: string;
  /** Present for split invites created with `invites/{id}` — use `acceptPendingInvite` for a single merge path. */
  inviteId?: string;
};

export type FriendConnectedMetadata = {
  friendUid: string;
  friendName: string;
  friendAvatarUrl: string | null;
  friendUsername: string;
};

export type AppNotification = {
  id: string;
  type: NotificationDocType;
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
  deepLink?: string;
  metadata?: Record<string, unknown> | null;
  actioned?: 'accepted' | 'declined' | null;
};

const PRIORITY: Record<string, number> = {
  split_invite: 0,
  split_invite_declined_by_member: 0,
  split_invite_expired: 0,
  friend_connected: 1,
  payment_received: 2,
  payment_overdue: 2,
};

export function sortNotifications(a: AppNotification, b: AppNotification): number {
  if (a.read !== b.read) return a.read ? 1 : -1;
  const pa = PRIORITY[a.type] ?? 3;
  const pb = PRIORITY[b.type] ?? 3;
  if (pa !== pb) return pa - pb;
  return b.createdAt.toMillis() - a.createdAt.toMillis();
}

export function formatNotificationRelativeTime(ts: { toDate?: () => Date } | null | undefined): string {
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

function parseNotificationDoc(id: string, data: Record<string, unknown>): AppNotification | null {
  const type = typeof data.type === 'string' ? data.type : 'system';
  const title = typeof data.title === 'string' ? data.title : '';
  const body = typeof data.body === 'string' ? data.body : '';
  const createdAt = data.createdAt as Timestamp | undefined;
  if (!createdAt || typeof createdAt.toMillis !== 'function') return null;

  const read = Boolean(data.read);
  const deepLink = typeof data.deepLink === 'string' ? data.deepLink : undefined;
  const metadata =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null;
  const actionedRaw = data.actioned;
  const actioned =
    actionedRaw === 'accepted' || actionedRaw === 'declined' ? actionedRaw : null;

  return {
    id,
    type,
    title: title.trim() || body.trim() || 'Notification',
    body: body.trim(),
    read,
    createdAt,
    deepLink,
    metadata,
    actioned,
  };
}

export function subscribeHomeNotifications(
  uid: string,
  onUpdate: (items: AppNotification[]) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100));

  const unsub: Unsubscribe = onSnapshot(
    q,
    (snap) => {
      const items: AppNotification[] = [];
      for (const d of snap.docs) {
        const row = parseNotificationDoc(d.id, d.data() as Record<string, unknown>);
        if (row) items.push(row);
      }
      items.sort(sortNotifications);
      onUpdate(items);
    },
    () => {
      onUpdate([]);
    }
  );

  return () => unsub();
}

export function subscribeUserUnreadNotificationCount(
  uid: string,
  onUpdate: (count: number | null) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate(null);
    return () => {};
  }

  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const v = snap.data()?.unreadNotificationCount;
      onUpdate(typeof v === 'number' && Number.isFinite(v) ? v : null);
    },
    () => onUpdate(null)
  );
}

export async function resetUnreadNotificationCount(uid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;
  await updateDoc(doc(db, 'users', uid), { unreadNotificationCount: 0 });
}

export async function updateNotificationFields(
  uid: string,
  notificationId: string,
  fields: { read?: boolean; actioned?: 'accepted' | 'declined' | null }
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), fields);
}

function parseSplitInviteMetadata(m: Record<string, unknown> | null | undefined): SplitInviteMetadata | null {
  if (!m) return null;
  const subscriptionId = typeof m.subscriptionId === 'string' ? m.subscriptionId : '';
  if (!subscriptionId) return null;
  const userShare =
    typeof m.userShare === 'number' && Number.isFinite(m.userShare)
      ? m.userShare
      : typeof m.memberShare === 'number' && Number.isFinite(m.memberShare)
        ? m.memberShare
        : 0;
  const inviteId =
    typeof m.inviteId === 'string' && m.inviteId.trim() ? m.inviteId.trim() : undefined;
  return {
    inviterUid: typeof m.inviterUid === 'string' ? m.inviterUid : '',
    inviterName: typeof m.inviterName === 'string' ? m.inviterName : 'Someone',
    inviterAvatarUrl: typeof m.inviterAvatarUrl === 'string' ? m.inviterAvatarUrl : null,
    subscriptionId,
    subscriptionName: typeof m.subscriptionName === 'string' ? m.subscriptionName : 'Subscription',
    serviceId: typeof m.serviceId === 'string' ? m.serviceId : '',
    userShare,
    billingCycle: typeof m.billingCycle === 'string' ? m.billingCycle : 'monthly',
    inviteId,
  };
}

/**
 * Accepts the split via `invites/{inviteId}` when `metadata.inviteId` is set (Cloud Function merges
 * subscription + friendship). Otherwise updates the subscription document directly (legacy).
 */
export async function acceptSplitInviteFromNotification(params: {
  uid: string;
  displayName: string;
  notificationId: string;
  metadata: SplitInviteMetadata;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const { uid, displayName, notificationId, metadata } = params;
  if (metadata.inviteId) {
    await acceptPendingInvite(metadata.inviteId, uid);
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      read: true,
      actioned: 'accepted',
    });
    return;
  }

  const subRef = doc(db, 'subscriptions', metadata.subscriptionId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('Subscription not found.');

  const raw = subSnap.data() as Record<string, unknown>;
  const memberUids: string[] = Array.isArray(raw.memberUids) ? [...raw.memberUids] : [];
  const activeMemberUids: string[] = Array.isArray(raw.activeMemberUids) ? [...raw.activeMemberUids] : [];
  const shares: Record<string, unknown>[] = Array.isArray(raw.splitMemberShares)
    ? raw.splitMemberShares.map((s) => (s && typeof s === 'object' ? { ...(s as object) } : {}))
    : [];
  const memberPaymentStatus: Record<string, string> =
    raw.memberPaymentStatus && typeof raw.memberPaymentStatus === 'object' && !Array.isArray(raw.memberPaymentStatus)
      ? { ...(raw.memberPaymentStatus as Record<string, string>) }
      : {};

  const totalCents = getTotalCents(raw);
  const pct =
    totalCents > 0 ? Math.round((metadata.userShare / totalCents) * 10000) / 100 : 0;
  const dn = displayName.trim() || 'Member';
  const init = initialsFromName(dn);

  const idx = shares.findIndex((s) => String(s.memberId ?? '') === uid);
  if (!memberUids.includes(uid)) memberUids.push(uid);
  if (!activeMemberUids.includes(uid)) activeMemberUids.push(uid);

  const firstMem = Array.isArray(raw.members) && raw.members.length > 0 ? raw.members[0] : undefined;
  const isObjectRoster = firstMem !== undefined && typeof firstMem === 'object' && firstMem !== null;
  const membersRoster: Record<string, unknown>[] = isObjectRoster
    ? (raw.members as Record<string, unknown>[]).map((m) =>
        m && typeof m === 'object' ? { ...m } : {}
      )
    : [];
  if (isObjectRoster) {
    const roIdx = membersRoster.findIndex((m) => String((m as { uid?: string }).uid ?? '') === uid);
    if (roIdx >= 0) {
      membersRoster[roIdx] = {
        ...membersRoster[roIdx],
        memberStatus: 'active',
        acceptedAt: Timestamp.now(),
        paymentStatus: 'pending',
        firstChargeObligationStartsNextCycle: computeFirstChargeObligationStartsNextCycle(raw),
      };
    }
  }

  const avatarBg = '#EEEDFE';
  const avatarColor = '#534AB7';

  if (idx >= 0) {
    shares[idx] = {
      ...shares[idx],
      memberId: uid,
      displayName: dn,
      role: shares[idx].role === 'owner' ? 'owner' : 'member',
      percent: pct,
      amountCents: metadata.userShare,
      initials: init,
      avatarBg,
      avatarColor,
      invitePending: false,
    };
  } else {
    shares.push({
      memberId: uid,
      displayName: dn,
      role: 'member',
      percent: pct,
      amountCents: metadata.userShare,
      initials: init,
      avatarBg,
      avatarColor,
      invitePending: false,
    });
  }
  memberPaymentStatus[uid] = 'pending';

  const syncedShares = isObjectRoster
    ? syncOwnerShareForPendingInvites(shares, totalCents, membersRoster as SubscriptionMemberRosterRow[])
    : shares;

  const patch: Record<string, unknown> = {
    memberUids,
    activeMemberUids,
    splitMemberShares: syncedShares,
    memberPaymentStatus,
    splitUpdatedAt: serverTimestamp(),
  };
  if (isObjectRoster) {
    patch.members = membersRoster;
  } else if (Array.isArray(raw.members) && raw.members.every((x) => typeof x === 'string')) {
    const legacy = [...(raw.members as string[])];
    if (!legacy.includes(uid)) legacy.push(uid);
    patch.members = legacy;
  }

  await updateDoc(subRef, patch);

  await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
    read: true,
    actioned: 'accepted',
  });
}

export async function declineSplitInviteNotification(uid: string, notificationId: string): Promise<void> {
  await updateNotificationFields(uid, notificationId, { read: true, actioned: 'declined' });
}

/**
 * Declines via `invites/{inviteId}` when present (Cloud Function removes pending slot + notifies owner).
 * Otherwise only marks the notification (legacy).
 */
export async function declineSplitInviteFromNotification(params: {
  uid: string;
  notificationId: string;
  metadata: SplitInviteMetadata;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const { uid, notificationId, metadata } = params;
  if (metadata.inviteId) {
    await declinePendingInvite(metadata.inviteId, uid);
  }
  await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
    read: true,
    actioned: 'declined',
  });
}

export async function markFriendConnectedNotificationRead(uid: string, notificationId: string): Promise<void> {
  await updateNotificationFields(uid, notificationId, { read: true });
}

export function getSplitInviteMetadata(n: AppNotification): SplitInviteMetadata | null {
  return parseSplitInviteMetadata(n.metadata ?? null);
}

export function getFriendConnectedMetadata(n: AppNotification): FriendConnectedMetadata | null {
  const m = n.metadata;
  if (!m) return null;
  const friendUid = typeof m.friendUid === 'string' ? m.friendUid : '';
  if (!friendUid) return null;
  return {
    friendUid,
    friendName: typeof m.friendName === 'string' ? m.friendName : 'Friend',
    friendAvatarUrl: typeof m.friendAvatarUrl === 'string' ? m.friendAvatarUrl : null,
    friendUsername: typeof m.friendUsername === 'string' ? m.friendUsername : '',
  };
}
