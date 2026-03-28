import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SubscriptionCard } from './SubscriptionCard';
import { useSubscriptionPriceBanner } from '../../../lib/subscription/useSubscriptionPriceBanner';
import {
  buildSubscriptionCardBase,
  extractPriceBannerFields,
  getOwnerId,
  lastSeenMsForSubscription,
  normalizeSubscriptionStatus,
} from '../../../lib/subscription/subscriptionToCardModel';
import type { MemberSubscriptionDoc } from '../../../lib/subscription/memberSubscriptionsFirestore';

type Props = {
  doc: MemberSubscriptionDoc;
  viewerUid: string;
  viewerAvatarUrl: string | null;
  lastSeenPriceMap: Record<string, { toMillis?: () => number }> | null | undefined;
  muted?: boolean;
  /** Subscriptions list: restart without navigating to detail first. */
  onEndedRestart?: (doc: MemberSubscriptionDoc) => void;
  /** Subscriptions list: delete after confirmation. */
  onEndedDelete?: (doc: MemberSubscriptionDoc) => void;
};

export function LiveSubscriptionCard({
  doc,
  viewerUid,
  viewerAvatarUrl,
  lastSeenPriceMap,
  muted,
  onEndedRestart,
  onEndedDelete,
}: Props) {
  const router = useRouter();
  const splitEnded = normalizeSubscriptionStatus(doc.status) === 'ended';
  const base = useMemo(
    () =>
      buildSubscriptionCardBase(doc, viewerUid, viewerAvatarUrl, {
        muted: muted || splitEnded,
        splitEnded,
      }),
    [doc, viewerUid, viewerAvatarUrl, muted, splitEnded]
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

  const isOwner = Boolean(viewerUid && getOwnerId(doc) === viewerUid);

  const onRestartSplit = () =>
    onEndedRestart
      ? onEndedRestart(doc)
      : Alert.alert('Restart split', 'This will be available when subscription management is connected.');
  const onDeleteSplit = () =>
    onEndedDelete
      ? onEndedDelete(doc)
      : Alert.alert('Delete', 'This will be available when subscription management is connected.');

  return (
    <SubscriptionCard
      {...base}
      faded={splitEnded}
      hideEditSplit={splitEnded}
      splitEndedActions={
        splitEnded && isOwner
          ? {
              onRestart: onRestartSplit,
              onDelete: onDeleteSplit,
            }
          : undefined
      }
      priceChange={
        !splitEnded && priceBannerVisible && priceBannerMessage
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
