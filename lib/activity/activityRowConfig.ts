/**
 * Visual hints per `ActivityEventType` (icons/badges are largely driven by
 * `activityEventToFeedItem` — this map documents the intended treatment).
 */
export const ACTIVITY_ROW_CONFIG = {
  payment_received: { icon: 'service', badge: 'amount_green' },
  payment_sent: { icon: 'service', badge: 'amount_green' },
  payment_failed: { icon: 'service', badge: 'failed_red' },
  payment_overdue: { icon: 'service', badge: 'overdue_amber' },
  reminder_sent: { icon: 'bell', badge: 'none' },
  reminder_received: { icon: 'bell', badge: 'nudge_amber' },
  split_invite_received: { icon: 'service', badge: 'action_purple' },
  split_invite_sent: { icon: 'service', badge: 'invite_green' },
  split_invite_accepted: { icon: 'service', badge: 'joined_green' },
  split_invite_declined: { icon: 'service', badge: 'declined_gray' },
  split_invite_declined_owner: { icon: 'service', badge: 'overdue_amber' },
  split_invite_expired: { icon: 'service', badge: 'overdue_amber' },
  split_member_joined: { icon: 'person_green', badge: 'joined_green' },
  split_member_removed: { icon: 'person_gray', badge: 'none' },
  split_left: { icon: 'person_gray', badge: 'ended_gray' },
  split_member_left: { icon: 'person_gray', badge: 'overdue_amber' },
  split_ended: { icon: 'service', badge: 'ended_gray' },
  split_percentage_updated: { icon: 'edit', badge: 'updated_purple' },
  split_price_updated: { icon: 'service', badge: 'price_amber' },
  friend_connected: { icon: 'avatar', badge: 'connected_purple' },
  friend_invite_accepted: { icon: 'avatar', badge: 'joined_green' },
  billing_cycle_complete: { icon: 'service', badge: 'amount_green' },
  billing_cycle_partial: { icon: 'service', badge: 'partial_amber' },
  auto_charge_enabled: { icon: 'lightning_green', badge: 'none' },
  auto_charge_disabled: { icon: 'lightning_gray', badge: 'none' },
} as const;
