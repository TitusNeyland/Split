/**
 * Returns a path for expo-router `router.push`, or null when there is no deep link.
 */
export function resolveActivityRoute(input: {
  activityType: string;
  subscriptionId?: string;
  joinSubscriptionId?: string;
  friendLinkIds?: string[];
  /** When false, do not route to subscription (feed row sets this for terminal / no-access cases). */
  navigateToSubscription?: boolean;
}): string | null {
  if (input.navigateToSubscription === false) {
    return null;
  }
  const t = input.activityType;
  if (t === 'friend_connected' || t === 'friend_invite_accepted') {
    // Friend profile screen removed — stay on Activity (expand detail if present).
    return null;
  }
  const sub =
    typeof input.subscriptionId === 'string' && input.subscriptionId.trim()
      ? input.subscriptionId.trim()
      : typeof input.joinSubscriptionId === 'string' && input.joinSubscriptionId.trim()
        ? input.joinSubscriptionId.trim()
        : null;
  if (sub) {
    return `/subscription/${sub}`;
  }
  return null;
}
