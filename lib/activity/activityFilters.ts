import type { ActivityEventType } from './activityFeedSchema';

/** Client-side filter: Payments tab */
export const ACTIVITY_FILTER_PAYMENTS: ActivityEventType[] = [
  'payment_received',
  'payment_sent',
  'payment_failed',
  'payment_overdue',
  'reminder_sent',
  'reminder_received',
];

/** Client-side filter: Splits tab (subscription + billing + auto-charge) */
export const ACTIVITY_FILTER_SPLITS: ActivityEventType[] = [
  'split_invite_received',
  'split_invite_sent',
  'split_invite_accepted',
  'split_invite_declined',
  'split_invite_expired',
  'split_member_joined',
  'split_member_removed',
  'split_ended',
  'split_restarted',
  'split_percentage_updated',
  'split_price_updated',
  'billing_cycle_complete',
  'billing_cycle_partial',
  'auto_charge_enabled',
  'auto_charge_disabled',
];

/** Client-side filter: Friends tab */
export const ACTIVITY_FILTER_FRIENDS: ActivityEventType[] = [
  'friend_connected',
  'friend_invite_accepted',
];

const PAY_SET = new Set<string>(ACTIVITY_FILTER_PAYMENTS);
const SPL_SET = new Set<string>(ACTIVITY_FILTER_SPLITS);
const FR_SET = new Set<string>(ACTIVITY_FILTER_FRIENDS);

export type ActivityFilterTabId = 'all' | 'payments' | 'splits' | 'friends';

export function activityEventMatchesFilter(
  tab: ActivityFilterTabId,
  type: ActivityEventType | undefined,
): boolean {
  if (tab === 'all') return true;
  if (!type) return false;
  if (tab === 'payments') return PAY_SET.has(type);
  if (tab === 'splits') return SPL_SET.has(type);
  if (tab === 'friends') return FR_SET.has(type);
  return false;
}
