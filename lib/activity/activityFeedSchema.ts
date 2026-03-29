import type { Timestamp } from 'firebase/firestore';

/**
 * Per-user activity feed: `users/{uid}/activity/{activityId}`.
 * Documents are written only by Cloud Functions — never by the client.
 */

/** Max events stored per user; oldest are deleted when exceeded (see Cloud Function). */
export const ACTIVITY_FEED_MAX_EVENTS = 200;

export const ACTIVITY_FEED_PAGE_SIZE = 50;

/**
 * All event kinds that may appear in the Activity tab.
 * Keep in sync with Cloud Functions that append to `users/{uid}/activity`.
 */
export type ActivityEventType =
  // Payments
  | 'payment_received'
  | 'payment_sent'
  | 'payment_failed'
  | 'payment_overdue'
  | 'reminder_sent'
  | 'reminder_received'
  // Splits
  | 'split_invite_received'
  /** Owner invited someone to the split (shown on owner’s feed). */
  | 'split_invite_sent'
  | 'split_invite_accepted'
  | 'split_invite_declined'
  /** Owner: a pending invite was not accepted before expiry. */
  | 'split_invite_expired'
  | 'split_member_joined'
  | 'split_member_removed'
  | 'split_ended'
  | 'split_restarted'
  | 'split_percentage_updated'
  | 'split_price_updated'
  // Friends
  | 'friend_connected'
  | 'friend_invite_accepted'
  // Billing
  | 'billing_cycle_started'
  | 'billing_cycle_complete'
  | 'billing_cycle_partial'
  // Account
  | 'auto_charge_enabled'
  | 'auto_charge_disabled';

/** Firestore document fields (document ID is separate from `id` when stored). */
export type ActivityEventFirestoreData = {
  type: ActivityEventType;
  createdAt: Timestamp;
  /** Default false for new events. */
  read: boolean;
  subscriptionId?: string;
  subscriptionName?: string;
  serviceId?: string;
  actorUid?: string;
  actorName?: string;
  actorAvatarUrl?: string | null;
  /** Amount in cents when monetary. */
  amount?: number;
  metadata?: Record<string, any>;
};

/**
 * Event with stable `id` from the document (prefer `doc.id` over any stored `id` field).
 */
export type ActivityEvent = ActivityEventFirestoreData & { id: string };

export function activityCollectionPath(uid: string): string {
  return `users/${uid}/activity`;
}
