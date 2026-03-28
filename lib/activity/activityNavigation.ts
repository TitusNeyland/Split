/**
 * Returns a path for expo-router `router.push`, or null when there is no deep link.
 */
export function resolveActivityRoute(input: {
  activityType: string;
  subscriptionId?: string;
  joinSubscriptionId?: string;
  friendLinkIds?: string[];
}): string | null {
  const t = input.activityType;
  if (t === 'friend_connected' || t === 'friend_invite_accepted') {
    const uid = input.friendLinkIds?.[0];
    if (uid) return `/friends/${uid}`;
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
