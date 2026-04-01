import type { Timestamp } from 'firebase/firestore';
import { formatUsdFromCents } from '../format/currency';
import type { ActivityEvent, ActivityEventType } from './activityFeedSchema';

const C = {
  text: '#1a1a18',
  green: '#1D9E75',
  orange: '#EF9F27',
  red: '#E24B4A',
  muted: '#888780',
  purple: '#534AB7',
};

function formatRelativeTime(ts: Timestamp): string {
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

function formatMoneyCents(cents: number | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${formatUsdFromCents(abs)}`;
}

function shortBrandName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return 'Subscription';
  return t.split(/\s+/)[0] ?? t;
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] ?? '';
    const b = parts[parts.length - 1][0] ?? '';
    return `${a}${b}`.toUpperCase() || '?';
  }
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function humanizeFailure(code: string): string {
  const m: Record<string, string> = {
    card_declined: 'Card declined',
    insufficient_funds: 'Insufficient funds',
    expired_card: 'Expired card',
    incorrect_cvc: 'Incorrect CVC',
    processing_error: 'Processing error',
  };
  return m[code] || 'Payment failed';
}

function formatRetryShort(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type ActivityFeedKind =
  | 'received'
  | 'payment_sent'
  | 'failed'
  | 'overdue'
  | 'reminder_sent'
  | 'reminder_received'
  | 'partial'
  | 'audit'
  | 'updated'
  | 'receipt'
  | 'audit_join'
  | 'audit_reminder'
  | 'audit_ended'
  | 'split_invite_received'
  | 'split_invite_sent'
  | 'split_invite_accepted'
  | 'split_invite_declined'
  | 'split_invite_declined_owner'
  | 'split_invite_expired'
  | 'split_member_joined'
  | 'split_member_removed'
  | 'split_left'
  | 'split_member_left'
  | 'split_ended'
  | 'split_percentage_updated'
  | 'split_price_updated'
  | 'friend_connected'
  | 'friend_invite_accepted'
  | 'billing_cycle_complete'
  | 'billing_cycle_partial'
  | 'auto_charge_enabled'
  | 'auto_charge_disabled';

export type ActivityBadgeVariant = 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'blue';

/** Row model aligned with `app/(tabs)/activity.tsx` ActivityFeedItem. */
export type ActivityFeedRow = {
  id: string;
  friendLinkIds?: string[];
  kind: ActivityFeedKind;
  serviceMark?: string;
  /** When Cloud Functions include `serviceId` on the activity doc (matches catalog). */
  serviceId?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  payerNote?: string;
  time: string;
  amount?: string;
  amountColor: string;
  badge: string;
  badgeVariant: ActivityBadgeVariant;
  partial?: { paid: number; total: number };
  detail?: {
    rows: { label: string; value: string; link?: boolean; valueAccent?: 'amber' }[];
    actions?: {
      id: string;
      label: string;
      variant: 'ghost' | 'primary' | 'danger';
      external?: boolean;
      opensMarkPaid?: boolean;
    }[];
  };
  /** For grouping / sorting (Firestore event time). */
  _activityCreatedAtMs?: number;
  /** Owner: send reminder to this member for this subscription. */
  _reminderTap?: { subscriptionId: string; memberUid: string };
  /** Navigate to subscription detail (split invite). */
  joinSubscriptionId?: string;
  /** Firestore `invites/{id}` — required to accept via Cloud Function merge. */
  joinInviteId?: string;
  /** Muted / desaturated service tile */
  serviceIconMuted?: boolean;
  /** Friend events: show actor avatar (initials or photo). */
  friendAvatar?: { initials: string; imageUrl?: string | null; uid?: string };
};

/**
 * Maps a stored activity event to a feed row for the Activity tab.
 */
export function activityEventToFeedRow(
  event: ActivityEvent,
  viewerUid?: string | null,
): ActivityFeedRow | null {
  const t = event.type as ActivityEventType;
  const createdAt = event.createdAt;
  const time = formatRelativeTime(createdAt);
  const subName = event.subscriptionName?.trim() || 'Subscription';
  const brand = shortBrandName(subName);
  const serviceMark = subName;
  const catalogServiceId =
    typeof event.serviceId === 'string' && event.serviceId.trim() ? event.serviceId.trim() : undefined;
  const amountCents = typeof event.amount === 'number' ? event.amount : undefined;
  const amountStr = formatMoneyCents(amountCents);
  const meta = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const cycleMonth =
    typeof meta.cycleMonth === 'string' && meta.cycleMonth.trim() ? meta.cycleMonth.trim() : null;
  const memberUid = typeof meta.memberUid === 'string' ? meta.memberUid : undefined;
  const createdMs = createdAt.toMillis();

  switch (t) {
    case 'payment_received': {
      const actor = event.actorName?.trim() || 'Someone';
      return {
        id: event.id,
        kind: 'received',
        friendLinkIds: memberUid ? [memberUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'checkmark',
        iconBg: '#E1F5EE',
        iconColor: C.green,
        title: `${actor} paid ${brand}`,
        sub: `${amountStr} · ${cycleMonth ? `${cycleMonth} cycle` : 'Current cycle'}`,
        time,
        amount: amountStr || undefined,
        amountColor: C.green,
        badge: 'Received',
        badgeVariant: 'green',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'payment_sent': {
      return {
        id: event.id,
        kind: 'payment_sent',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'checkmark',
        iconBg: '#E1F5EE',
        iconColor: C.green,
        title: `You paid ${brand}`,
        sub: `${amountStr} · ${cycleMonth ? `${cycleMonth} cycle` : 'Current cycle'}`,
        time,
        amount: amountStr || undefined,
        amountColor: C.green,
        badge: 'Paid',
        badgeVariant: 'green',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'payment_failed': {
      const actor = event.actorName?.trim() || 'Someone';
      const failCode = typeof meta.failureReason === 'string' ? meta.failureReason : 'failed';
      const retryTs = meta.retryAt as Timestamp | undefined;
      const retryLabel = formatRetryShort(retryTs);
      return {
        id: event.id,
        kind: 'failed',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'alert-circle-outline',
        iconBg: '#FCEBEB',
        iconColor: '#A32D2D',
        title: `${actor}'s payment failed · ${brand}`,
        sub: `${humanizeFailure(failCode)}${retryLabel ? ` · retrying ${retryLabel}` : ''}`,
        time,
        amount: amountStr || undefined,
        amountColor: C.red,
        badge: 'Failed',
        badgeVariant: 'red',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'payment_overdue': {
      const actor = event.actorName?.trim() || 'Someone';
      const days =
        typeof meta.daysOverdue === 'number' && Number.isFinite(meta.daysOverdue)
          ? meta.daysOverdue
          : 1;
      const subId = event.subscriptionId;
      const memberUid = event.actorUid;
      return {
        id: event.id,
        kind: 'overdue',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'time-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: `${actor} is overdue · ${brand}`,
        sub: `${amountStr} · ${days} day${days === 1 ? '' : 's'} past due`,
        time,
        amount: amountStr || undefined,
        amountColor: C.orange,
        badge: 'Overdue',
        badgeVariant: 'amber',
        _activityCreatedAtMs: createdMs,
        _reminderTap:
          typeof subId === 'string' && subId && typeof memberUid === 'string' && memberUid
            ? { subscriptionId: subId, memberUid }
            : undefined,
        detail: {
          rows: [
            { label: 'Subscription', value: subName },
            { label: 'Member', value: actor },
            { label: 'Amount', value: amountStr || '—' },
          ],
          actions: [{ id: 'send-reminder', label: 'Send reminder', variant: 'primary' }],
        },
      };
    }
    case 'reminder_sent': {
      const target = event.actorName?.trim() || 'Member';
      const first = target.split(/\s+/)[0] ?? target;
      return {
        id: event.id,
        kind: 'reminder_sent',
        icon: 'notifications-outline',
        iconBg: '#F0EEE9',
        iconColor: C.muted,
        title: `Reminder sent to ${first}`,
        sub: `${subName} · ${amountStr}`,
        time,
        amount: amountStr || undefined,
        amountColor: C.text,
        badge: 'Reminder',
        badgeVariant: 'gray',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'reminder_received': {
      const from = event.actorName?.trim() || 'Someone';
      return {
        id: event.id,
        kind: 'reminder_received',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        icon: 'notifications-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: `${from} nudged you · ${brand}`,
        sub: `${amountStr} still pending`,
        time,
        amount: amountStr || undefined,
        amountColor: C.orange,
        badge: 'Reminder',
        badgeVariant: 'amber',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_invite_received': {
      const actor = event.actorName?.trim() || 'Someone';
      const userShareCents =
        typeof event.amount === 'number' && Number.isFinite(event.amount)
          ? event.amount
          : typeof meta.userShareCents === 'number' && Number.isFinite(meta.userShareCents)
            ? meta.userShareCents
            : undefined;
      const shareStr = userShareCents != null ? formatMoneyCents(userShareCents) : '';
      const subId = event.subscriptionId;
      const inviteId =
        typeof meta.inviteId === 'string' && meta.inviteId.trim() ? meta.inviteId.trim() : undefined;
      return {
        id: event.id,
        kind: 'split_invite_received',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'mail-outline',
        iconBg: '#EEEDFE',
        iconColor: C.purple,
        title: `${actor} invited you to ${brand}`,
        sub: shareStr ? `Your share · ${shareStr}/month` : 'Open to accept',
        time,
        amount: shareStr || undefined,
        amountColor: C.text,
        badge: 'Join',
        badgeVariant: 'purple',
        joinSubscriptionId: typeof subId === 'string' && subId ? subId : undefined,
        joinInviteId: inviteId,
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_invite_sent': {
      const inviteeName =
        typeof meta.inviteeName === 'string' && meta.inviteeName.trim()
          ? meta.inviteeName.trim()
          : 'Member';
      const first = inviteeName.split(/\s+/)[0] ?? inviteeName;
      const userShareCents =
        typeof meta.userShareCents === 'number' && Number.isFinite(meta.userShareCents)
          ? meta.userShareCents
          : undefined;
      const shareStr = userShareCents != null ? formatMoneyCents(userShareCents) : '';
      const inviteeUid = typeof meta.inviteeUid === 'string' ? meta.inviteeUid : undefined;
      return {
        id: event.id,
        kind: 'split_invite_sent',
        friendLinkIds: inviteeUid ? [inviteeUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'person-add-outline',
        iconBg: '#E1F5EE',
        iconColor: '#0F6E56',
        title: `You invited ${first} to ${brand}`,
        sub: shareStr ? `Their share · ${shareStr}/month` : 'Pending join',
        time,
        amount: shareStr || undefined,
        amountColor: C.text,
        badge: 'Invite',
        badgeVariant: 'green',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_invite_accepted': {
      const ownerName =
        typeof meta.ownerName === 'string' && meta.ownerName.trim() ? meta.ownerName.trim() : 'Owner';
      const shareCents =
        typeof event.amount === 'number' && Number.isFinite(event.amount) ? event.amount : 0;
      const shareStr = formatMoneyCents(shareCents);
      return {
        id: event.id,
        kind: 'split_invite_accepted',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'checkmark-circle-outline',
        iconBg: '#E1F5EE',
        iconColor: C.green,
        title: `You joined ${subName}`,
        sub: `${ownerName}'s split · ${shareStr}/month`,
        time,
        amountColor: C.text,
        badge: 'Joined',
        badgeVariant: 'green',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_invite_declined': {
      const inviter = event.actorName?.trim() || 'Someone';
      return {
        id: event.id,
        kind: 'split_invite_declined',
        serviceMark,
        serviceId: catalogServiceId,
        serviceIconMuted: true,
        icon: 'close-outline',
        iconBg: '#F0EEE9',
        iconColor: C.muted,
        title: `You declined ${subName}`,
        sub: `${inviter}'s split`,
        time,
        amountColor: C.muted,
        badge: 'Declined',
        badgeVariant: 'gray',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_invite_declined_owner': {
      const decliner = event.actorName?.trim() || 'Someone';
      const first = decliner.split(/\s+/)[0] ?? decliner;
      return {
        id: event.id,
        kind: 'split_invite_declined_owner',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'person-remove-outline',
        iconBg: '#FEF3C7',
        iconColor: '#B45309',
        title: `${first} declined your ${brand} invite`,
        sub: 'Invite someone else to fill this slot',
        time,
        amountColor: C.muted,
        badge: 'Declined',
        badgeVariant: 'amber',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_invite_expired': {
      const inviteeName =
        typeof meta.inviteeName === 'string' && meta.inviteeName.trim()
          ? meta.inviteeName.trim()
          : 'Member';
      const first = inviteeName.split(/\s+/)[0] ?? inviteeName;
      return {
        id: event.id,
        kind: 'split_invite_expired',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'time-outline',
        iconBg: '#FAEEDA',
        iconColor: C.orange,
        title: `${first}'s invite to ${brand} expired`,
        sub: 'Invite someone else',
        time,
        amountColor: C.muted,
        badge: 'Expired',
        badgeVariant: 'amber',
        joinSubscriptionId: typeof event.subscriptionId === 'string' ? event.subscriptionId : undefined,
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_member_joined': {
      const actor = event.actorName?.trim() || 'Someone';
      const newShare =
        typeof meta.newMemberShare === 'number' && Number.isFinite(meta.newMemberShare)
          ? meta.newMemberShare
          : 0;
      const shareStr = formatMoneyCents(newShare);
      return {
        id: event.id,
        kind: 'split_member_joined',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        friendAvatar: {
          initials: initialsFromDisplayName(actor),
          imageUrl: event.actorAvatarUrl ?? null,
          uid: event.actorUid || undefined,
        },
        icon: 'person',
        iconBg: '#E1F5EE',
        iconColor: '#0F6E56',
        title: `${actor} joined ${subName}`,
        sub: shareStr ? `Their share · ${shareStr}/month` : 'New member',
        time,
        amountColor: C.text,
        badge: 'Joined',
        badgeVariant: 'green',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_member_removed': {
      const removedUid = typeof meta.removedMemberUid === 'string' ? meta.removedMemberUid : undefined;
      const actor = event.actorName?.trim() || 'Someone';
      const youRemoved =
        typeof viewerUid === 'string' && viewerUid && removedUid === viewerUid;
      return {
        id: event.id,
        kind: 'split_member_removed',
        icon: 'person-remove-outline',
        iconBg: '#F0EEE9',
        iconColor: C.muted,
        title: youRemoved ? `You were removed from ${brand}` : `${actor} was removed from ${brand}`,
        sub: youRemoved ? 'Removed from this split' : 'Member removed',
        time,
        amountColor: C.muted,
        badge: 'Removed',
        badgeVariant: 'gray',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_left': {
      return {
        id: event.id,
        kind: 'split_left',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'log-out-outline',
        iconBg: '#F0EEE9',
        iconColor: C.muted,
        title: `You left ${brand}`,
        sub: 'You will not be charged for future cycles',
        time,
        amountColor: C.text,
        badge: 'Left',
        badgeVariant: 'gray',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_member_left': {
      const actor = event.actorName?.trim() || 'Someone';
      return {
        id: event.id,
        kind: 'split_member_left',
        serviceMark,
        serviceId: catalogServiceId,
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        friendAvatar: {
          initials: initialsFromDisplayName(actor),
          imageUrl: event.actorAvatarUrl ?? null,
          uid: event.actorUid || undefined,
        },
        icon: 'person-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: `${actor} left ${brand}`,
        sub: 'They will not be charged for future cycles',
        time,
        amountColor: C.text,
        badge: 'Member left',
        badgeVariant: 'amber',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_ended': {
      const actor = event.actorName?.trim() || 'Someone';
      const endedByUid = event.actorUid;
      return {
        id: event.id,
        kind: 'split_ended',
        friendLinkIds: endedByUid ? [endedByUid] : undefined,
        serviceMark,
        serviceId: catalogServiceId,
        serviceIconMuted: true,
        icon: 'close-circle-outline',
        iconBg: '#F0EEE9',
        iconColor: '#5F5E5A',
        title: `${subName} split ended`,
        sub: `${actor} ended this split`,
        time,
        amountColor: C.text,
        badge: 'Ended',
        badgeVariant: 'gray',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_price_updated': {
      const oldP = typeof meta.oldPrice === 'number' ? meta.oldPrice : 0;
      const newP = typeof meta.newPrice === 'number' ? meta.newPrice : 0;
      return {
        id: event.id,
        kind: 'split_price_updated',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'information-circle-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: `${brand} price updated`,
        sub: `${formatMoneyCents(oldP)} → ${formatMoneyCents(newP)} · your share changed`,
        time,
        amountColor: C.orange,
        badge: 'Updated',
        badgeVariant: 'amber',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'split_percentage_updated': {
      const actor = event.actorName?.trim() || 'Someone';
      const rawChanges = Array.isArray(meta.changes) ? meta.changes : [];
      const changes = rawChanges.filter((c) => c && typeof c === 'object') as Array<{
        memberName?: string;
        memberId?: string;
        oldPct?: number;
        newPct?: number;
        oldAmountCents?: number;
        newAmountCents?: number;
      }>;
      let subLine = 'Split percentages updated';
      const mine = changes.find(
        (c) => typeof viewerUid === 'string' && c.memberId === viewerUid,
      );
      if (mine) {
        if (
          mine.oldAmountCents != null &&
          mine.newAmountCents != null &&
          mine.oldAmountCents !== mine.newAmountCents
        ) {
          subLine = `Your share changed from ${formatMoneyCents(mine.oldAmountCents)} → ${formatMoneyCents(mine.newAmountCents)}`;
        } else if (mine.oldPct != null && mine.newPct != null) {
          subLine = `Your share changed from ${mine.oldPct}% → ${mine.newPct}%`;
        }
      }
      return {
        id: event.id,
        kind: 'split_percentage_updated',
        icon: 'create-outline',
        iconBg: '#EEEDFE',
        iconColor: C.purple,
        title: `Split updated · ${subName}`,
        sub: subLine,
        time,
        amountColor: C.text,
        badge: 'Updated',
        badgeVariant: 'purple',
        detail: {
          rows: [
            { label: 'Updated by', value: actor },
            ...changes.slice(0, 6).map((c) => ({
              label: typeof c.memberName === 'string' ? c.memberName : 'Member',
              value:
                c.oldAmountCents != null && c.newAmountCents != null
                  ? `${formatMoneyCents(c.oldAmountCents)} → ${formatMoneyCents(c.newAmountCents)}`
                  : `${c.oldPct ?? '—'}% → ${c.newPct ?? '—'}%`,
            })),
          ],
        },
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'friend_connected': {
      const actor = event.actorName?.trim() || 'Someone';
      const fu = typeof meta.friendUsername === 'string' ? meta.friendUsername.trim() : '';
      const handle = fu ? (fu.startsWith('@') ? fu : `@${fu}`) : '';
      const uid = typeof meta.friendUid === 'string' ? meta.friendUid : event.actorUid;
      return {
        id: event.id,
        kind: 'friend_connected',
        friendLinkIds: uid ? [uid] : undefined,
        friendAvatar: {
          initials: initialsFromDisplayName(actor),
          imageUrl: event.actorAvatarUrl ?? null,
          uid: uid || undefined,
        },
        icon: 'person-outline',
        iconBg: '#EEEDFE',
        iconColor: C.purple,
        title: `${actor} connected with you`,
        sub: handle || 'New connection',
        time,
        amountColor: C.text,
        badge: 'Connected',
        badgeVariant: 'purple',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'friend_invite_accepted': {
      const actor = event.actorName?.trim() || 'Someone';
      const uid = typeof meta.friendUid === 'string' ? meta.friendUid : event.actorUid;
      return {
        id: event.id,
        kind: 'friend_invite_accepted',
        friendLinkIds: uid ? [uid] : undefined,
        friendAvatar: {
          initials: initialsFromDisplayName(actor),
          imageUrl: event.actorAvatarUrl ?? null,
          uid: uid || undefined,
        },
        icon: 'person-outline',
        iconBg: '#E1F5EE',
        iconColor: C.green,
        title: `${actor} accepted your invite`,
        sub: 'You are now connected',
        time,
        amountColor: C.text,
        badge: 'Connected',
        badgeVariant: 'green',
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'billing_cycle_complete': {
      const memberCount =
        typeof meta.memberCount === 'number' && Number.isFinite(meta.memberCount) ? meta.memberCount : 0;
      const totalStr = amountStr || formatMoneyCents(amountCents ?? 0);
      const cm = cycleMonth ?? 'This cycle';
      return {
        id: event.id,
        kind: 'billing_cycle_complete',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'checkmark-circle-outline',
        iconBg: '#E1F5EE',
        iconColor: C.green,
        title: `${brand} fully collected`,
        sub:
          memberCount > 0
            ? `All ${memberCount} members paid · ${totalStr} total`
            : `All paid · ${totalStr} total`,
        time,
        amount: totalStr || undefined,
        amountColor: C.green,
        badge: 'Complete',
        badgeVariant: 'green',
        detail: {
          rows: [
            { label: 'Cycle', value: cm },
            { label: 'Collected', value: totalStr },
          ],
        },
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'billing_cycle_partial': {
      const paidCount =
        typeof meta.paidCount === 'number' && Number.isFinite(meta.paidCount) ? meta.paidCount : 0;
      const totalCount =
        typeof meta.totalCount === 'number' && Number.isFinite(meta.totalCount) ? meta.totalCount : 0;
      const outstanding =
        typeof meta.outstanding === 'number' && Number.isFinite(meta.outstanding) ? meta.outstanding : 0;
      const cm = cycleMonth ?? 'Cycle';
      const monthWord = cm.split(/\s+/)[0] ?? cm;
      return {
        id: event.id,
        kind: 'billing_cycle_partial',
        serviceMark,
        serviceId: catalogServiceId,
        icon: 'alert-circle-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: `${monthWord} cycle closed · ${brand}`,
        sub: `${paidCount} of ${totalCount} paid · ${formatMoneyCents(outstanding)} outstanding`,
        time,
        amountColor: C.orange,
        badge: 'Partial',
        badgeVariant: 'amber',
        detail: {
          rows: [
            { label: 'Cycle', value: cm },
            { label: 'Outstanding', value: formatMoneyCents(outstanding), valueAccent: 'amber' },
          ],
        },
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'auto_charge_enabled': {
      const actor = event.actorName?.trim() || 'Someone';
      return {
        id: event.id,
        kind: 'auto_charge_enabled',
        icon: 'flash-outline',
        iconBg: '#E1F5EE',
        iconColor: C.green,
        title: `Auto-charge enabled · ${subName}`,
        sub: 'Members will be charged automatically',
        time,
        amountColor: C.text,
        badge: 'Auto-charge',
        badgeVariant: 'green',
        detail: {
          rows: [{ label: 'Enabled by', value: actor }],
        },
        _activityCreatedAtMs: createdMs,
      };
    }
    case 'auto_charge_disabled': {
      const actor = event.actorName?.trim() || 'Someone';
      return {
        id: event.id,
        kind: 'auto_charge_disabled',
        icon: 'flash-off-outline',
        iconBg: '#F0EEE9',
        iconColor: C.muted,
        title: `Auto-charge disabled · ${subName}`,
        sub: 'Payments are now manual',
        time,
        amountColor: C.muted,
        badge: 'Manual',
        badgeVariant: 'gray',
        detail: {
          rows: [{ label: 'Changed by', value: actor }],
        },
        _activityCreatedAtMs: createdMs,
      };
    }
    default: {
      /** Old `split_restarted` Firestore docs: generic gray row (type removed from schema). */
      if (String(t) === 'split_restarted') {
        const nextBill =
          typeof meta.nextBillingLabel === 'string' && meta.nextBillingLabel.trim()
            ? meta.nextBillingLabel.trim()
            : '';
        return {
          id: event.id,
          kind: 'split_ended',
          serviceMark,
          serviceId: catalogServiceId,
          icon: 'ellipse-outline',
          iconBg: '#F0EEE9',
          iconColor: '#5F5E5A',
          title: `${subName}`,
          sub: nextBill ? `Subscription activity · ${nextBill}` : 'Subscription activity',
          time,
          amountColor: C.text,
          badge: 'Activity',
          badgeVariant: 'gray',
          _activityCreatedAtMs: createdMs,
        };
      }
      return null;
    }
  }
}
