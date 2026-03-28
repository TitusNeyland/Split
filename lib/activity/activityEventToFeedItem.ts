import type { Timestamp } from 'firebase/firestore';
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
  return `${neg ? '-' : ''}$${(abs / 100).toFixed(2)}`;
}

function shortBrandName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return 'Subscription';
  return t.split(/\s+/)[0] ?? t;
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
  | 'split_ended';

export type ActivityBadgeVariant = 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'blue';

/** Row model aligned with `app/(tabs)/activity.tsx` ActivityFeedItem. */
export type ActivityFeedRow = {
  id: string;
  friendLinkIds?: string[];
  kind: ActivityFeedKind;
  serviceMark?: string;
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
        typeof meta.userShareCents === 'number' && Number.isFinite(meta.userShareCents)
          ? meta.userShareCents
          : undefined;
      const shareStr = userShareCents != null ? formatMoneyCents(userShareCents) : '';
      return {
        id: event.id,
        kind: 'split_invite_received',
        friendLinkIds: event.actorUid ? [event.actorUid] : undefined,
        serviceMark,
        icon: 'mail-outline',
        iconBg: '#EEEDFE',
        iconColor: C.purple,
        title: `${actor} invited you to ${brand}`,
        sub: shareStr ? `Your share · ${shareStr}/month` : 'Open to accept',
        time,
        amount: shareStr || undefined,
        amountColor: C.text,
        badge: 'Invite',
        badgeVariant: 'purple',
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
    case 'split_ended': {
      const actor = event.actorName?.trim() || 'Someone';
      const endedByUid = event.actorUid;
      const youEnded =
        typeof viewerUid === 'string' &&
        viewerUid &&
        typeof endedByUid === 'string' &&
        endedByUid === viewerUid;
      const title = youEnded ? `You ended ${brand}` : `${actor} ended ${brand}`;
      return {
        id: event.id,
        kind: 'split_ended',
        friendLinkIds: endedByUid ? [endedByUid] : undefined,
        serviceMark,
        icon: 'close-circle-outline',
        iconBg: '#F0EEE9',
        iconColor: '#5F5E5A',
        title,
        sub: 'Split ended · billing stopped',
        time,
        amountColor: C.text,
        badge: 'Ended',
        badgeVariant: 'gray',
        _activityCreatedAtMs: createdMs,
      };
    }
    default:
      return null;
  }
}
