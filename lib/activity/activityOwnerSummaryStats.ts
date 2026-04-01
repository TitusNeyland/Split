import type { MemberSubscriptionDoc } from '../subscription/memberSubscriptionsFirestore';
import {
  computeCollectedThisMonthCents,
  computeOwedToYouCents,
  computeOwnerPendingMemberCounts,
} from '../subscription/subscriptionDerivedMetrics';

/**
 * Collected this month + pending owed to the viewer as split owner, from in-memory subscription docs
 * (same source as SubscriptionsContext). Pending total matches {@link computeOwedToYouCents} (home hero).
 */
export function computeActivityOwnerSummaryStats(
  subscriptions: MemberSubscriptionDoc[],
  uid: string,
  now = new Date()
): {
  collectedThisMonthCents: number;
  pendingCents: number;
  pendingOverdueCount: number;
  pendingOnlyCount: number;
} {
  if (!uid) {
    return {
      collectedThisMonthCents: 0,
      pendingCents: 0,
      pendingOverdueCount: 0,
      pendingOnlyCount: 0,
    };
  }

  const collectedThisMonthCents = computeCollectedThisMonthCents(subscriptions, uid, now);
  const pendingCents = computeOwedToYouCents(subscriptions, uid);
  const { pendingOverdueCount, pendingOnlyCount } = computeOwnerPendingMemberCounts(subscriptions, uid);

  return {
    collectedThisMonthCents,
    pendingCents,
    pendingOverdueCount,
    pendingOnlyCount,
  };
}
