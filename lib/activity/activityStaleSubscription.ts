import type { ActivityEvent, ActivityEventType } from './activityFeedSchema';

/**
 * These events stay in the feed for context even when the subscription is gone or marked
 * `subscriptionDeleted` (Layer 2). They must not deep-link to `/subscription/[id]`.
 */
export const ACTIVITY_TYPES_SUBSCRIPTION_INFO_ONLY = new Set<ActivityEventType>([
  'split_ended',
  'split_member_removed',
  'split_left',
]);

export function shouldIncludeActivityEventInFeed(e: ActivityEvent): boolean {
  if (!e.subscriptionDeleted) return true;
  return ACTIVITY_TYPES_SUBSCRIPTION_INFO_ONLY.has(e.type);
}

export function shouldSkipSubscriptionExistenceValidation(type: ActivityEventType): boolean {
  return ACTIVITY_TYPES_SUBSCRIPTION_INFO_ONLY.has(type);
}

export function filterActivityEventsForFeed(events: ActivityEvent[]): ActivityEvent[] {
  return events.filter(shouldIncludeActivityEventInFeed);
}
