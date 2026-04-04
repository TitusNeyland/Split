import type { ActivityFeedKind } from './activityEventToFeedItem';
import type { ActivityEventType } from './activityFeedSchema';

/**
 * Semantic badge kinds — shared by Activity tab and Home “Recent activity”.
 * Each maps to one pill style (background + text color) in `ActivityBadge`.
 */
export type ActivitySemanticBadgeVariant =
  | 'received'
  | 'paid'
  | 'joined'
  | 'overdue'
  | 'partial'
  | 'pending'
  | 'failed'
  | 'ended'
  | 'reminder'
  | 'updated'
  | 'audit';

export const ACTIVITY_BADGE_STYLES: Record<
  ActivitySemanticBadgeVariant,
  { bg: string; color: string }
> = {
  received: { bg: '#E1F5EE', color: '#0F6E56' },
  paid: { bg: '#E1F5EE', color: '#0F6E56' },
  joined: { bg: '#E1F5EE', color: '#0F6E56' },
  overdue: { bg: '#FAEEDA', color: '#854F0B' },
  partial: { bg: '#FAEEDA', color: '#854F0B' },
  pending: { bg: '#FAEEDA', color: '#854F0B' },
  reminder: { bg: '#FAEEDA', color: '#854F0B' },
  failed: { bg: '#FCEBEB', color: '#A32D2D' },
  ended: { bg: '#F0EEE9', color: '#5F5E5A' },
  updated: { bg: '#F0EEE9', color: '#5F5E5A' },
  audit: { bg: '#EEEDFE', color: '#534AB7' },
};

/** Default label when a screen does not pass a custom `label` (matches feed copy where applicable). */
export const ACTIVITY_BADGE_DEFAULT_LABELS: Record<ActivitySemanticBadgeVariant, string> = {
  received: 'Received',
  paid: 'Paid',
  joined: 'Joined',
  overdue: 'Overdue',
  partial: 'Partial',
  pending: 'Pending',
  reminder: 'Reminder',
  failed: 'Failed',
  ended: 'Ended',
  updated: 'Updated',
  audit: 'Audit',
};

/**
 * Maps a Firestore activity event type to the pill variant used on Activity + Home.
 * Labels still come from `activityEventToFeedItem` (`badge` string) so copy stays accurate
 * (e.g. “Join”, “Declined”, “Complete”).
 */
export function getActivitySemanticBadgeVariant(
  eventType: ActivityEventType | string
): ActivitySemanticBadgeVariant {
  switch (eventType as ActivityEventType) {
    case 'payment_received':
    case 'billing_cycle_complete':
      return 'received';
    case 'payment_sent':
      return 'paid';
    case 'split_member_joined':
    case 'split_invite_accepted':
    case 'split_invite_sent':
    case 'friend_invite_accepted':
      return 'joined';
    case 'payment_overdue':
      return 'overdue';
    case 'billing_cycle_partial':
      return 'partial';
    case 'payment_failed':
      return 'failed';
    case 'split_ended':
    case 'split_member_removed':
    case 'split_left':
    case 'auto_charge_disabled':
      return 'ended';
    case 'reminder_sent':
    case 'reminder_received':
    case 'split_invite_declined_owner':
    case 'split_invite_expired':
    case 'split_member_left':
      return 'reminder';
    case 'split_price_updated':
    case 'split_percentage_updated':
      return 'updated';
    case 'split_invite_received':
    case 'friend_connected':
      return 'audit';
    case 'split_invite_declined':
      return 'ended';
    case 'auto_charge_enabled':
      return 'received';
    default:
      return 'audit';
  }
}

/**
 * Feed row can override Firestore type for display (e.g. overdue row marked paid manually).
 */
export function getActivityBadgeVariantForFeedItem(input: {
  activityType: ActivityEventType;
  kind: ActivityFeedKind;
  badge: string;
}): ActivitySemanticBadgeVariant {
  if (input.kind === 'received' && input.badge === 'Paid') {
    return 'paid';
  }
  return getActivitySemanticBadgeVariant(input.activityType);
}
