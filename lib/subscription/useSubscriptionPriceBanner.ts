import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatPriceChangeBannerMessage,
  shouldShowSubscriptionPriceBanner,
  timestampToMs,
  type SubscriptionPriceBannerFields,
} from './subscriptionPriceChangeBanner';
import { acknowledgeSubscriptionPriceChange } from './subscriptionPriceChangeAckFirestore';

export type UseSubscriptionPriceBannerArgs = {
  subscriptionId: string;
  /** Current user; required to persist dismiss unless skipFirestore. */
  uid: string | null;
  /** Subset of subscription fields from Firestore (or demo). */
  subscription: SubscriptionPriceBannerFields | null;
  /**
   * `users/{uid}.lastSeenPriceChangeBySubscription[subscriptionId]` as millis, if any.
   */
  userLastSeenPriceChangeMs: number | null;
  /** Demo / offline: only hide locally, no Firestore. */
  skipFirestore?: boolean;
};

export function useSubscriptionPriceBanner({
  subscriptionId,
  uid,
  subscription,
  userLastSeenPriceChangeMs,
  skipFirestore = false,
}: UseSubscriptionPriceBannerArgs) {
  const [optimisticDismissed, setOptimisticDismissed] = useState(false);

  const changeKey = subscription
    ? `${timestampToMs(subscription.priceChangedAt as { toMillis: () => number }) ?? 0}-${subscription.priceChangeToCents ?? 0}`
    : '';

  useEffect(() => {
    setOptimisticDismissed(false);
  }, [subscriptionId, changeKey]);

  const visible = useMemo(() => {
    if (optimisticDismissed || !subscription) return false;
    return shouldShowSubscriptionPriceBanner(subscription, userLastSeenPriceChangeMs);
  }, [optimisticDismissed, subscription, userLastSeenPriceChangeMs]);

  const message = useMemo(() => {
    if (!subscription) return '';
    const a = subscription.priceChangeFromCents;
    const b = subscription.priceChangeToCents;
    if (a == null || b == null) return '';
    return formatPriceChangeBannerMessage(a, b);
  }, [subscription]);

  const dismiss = useCallback(async () => {
    setOptimisticDismissed(true);
    if (skipFirestore || !uid) return;
    try {
      await acknowledgeSubscriptionPriceChange(uid, subscriptionId);
    } catch (e) {
      setOptimisticDismissed(false);
      throw e;
    }
  }, [skipFirestore, uid, subscriptionId]);

  return {
    visible,
    message,
    dismiss,
    /** Reset local dismiss when subscription id or change timestamp changes (e.g. new navigation). */
    resetLocalDismiss: () => setOptimisticDismissed(false),
  };
}
