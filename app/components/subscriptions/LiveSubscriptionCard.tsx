import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SubscriptionCard } from './SubscriptionCard';
import { useSubscriptionPriceBanner } from '../../../lib/subscription/useSubscriptionPriceBanner';
import {
  buildSubscriptionCardBase,
  extractPriceBannerFields,
  lastSeenMsForSubscription,
} from '../../../lib/subscription/subscriptionToCardModel';
import type { MemberSubscriptionDoc } from '../../../lib/subscription/memberSubscriptionsFirestore';

type Props = {
  doc: MemberSubscriptionDoc;
  viewerUid: string;
  viewerAvatarUrl: string | null;
  lastSeenPriceMap: Record<string, { toMillis?: () => number }> | null | undefined;
  muted?: boolean;
};

export function LiveSubscriptionCard({
  doc,
  viewerUid,
  viewerAvatarUrl,
  lastSeenPriceMap,
  muted,
}: Props) {
  const router = useRouter();
  const base = useMemo(
    () => buildSubscriptionCardBase(doc, viewerUid, viewerAvatarUrl, { muted }),
    [doc, viewerUid, viewerAvatarUrl, muted]
  );

  const priceFields = useMemo(() => extractPriceBannerFields(doc), [doc]);
  const userLastSeen = lastSeenMsForSubscription(lastSeenPriceMap, doc.id);

  const { visible: priceBannerVisible, message: priceBannerMessage, dismiss: dismissPriceBanner } =
    useSubscriptionPriceBanner({
      subscriptionId: doc.id,
      uid: viewerUid,
      subscription: priceFields,
      userLastSeenPriceChangeMs: userLastSeen,
      skipFirestore: false,
    });

  const onDismissPriceBanner = () => {
    void dismissPriceBanner().catch((e) =>
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e))
    );
  };

  const goDetail = () => router.push(`/subscription/${doc.id}`);

  return (
    <SubscriptionCard
      {...base}
      priceChange={
        priceBannerVisible && priceBannerMessage
          ? {
              message: priceBannerMessage,
              onDismiss: onDismissPriceBanner,
            }
          : undefined
      }
      onCardPress={goDetail}
      onEditSplitPress={goDetail}
    />
  );
}
