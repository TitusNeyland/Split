import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SubscriptionCard } from './SubscriptionCard';
import { useSubscriptionPriceBanner } from '../../lib/subscription/useSubscriptionPriceBanner';
import {
  buildSubscriptionCardBase,
  extractPriceBannerFields,
  getOwnerId,
  lastSeenMsForSubscription,
  normalizeSubscriptionStatus,
  getTotalCents,
  getMemberAmountCents,
} from '../../lib/subscription/subscriptionToCardModel';
import { formatUsdDollarsFixed2 } from '../../lib/format/currency';
import type { MemberSubscriptionDoc } from '../../lib/subscription/memberSubscriptionsFirestore';

type Props = {
  doc: MemberSubscriptionDoc;
  viewerUid: string;
  viewerAvatarUrl: string | null;
  lastSeenPriceMap: Record<string, { toMillis?: () => number }> | null | undefined;
  muted?: boolean;
  /** Subscriptions list: delete after confirmation. */
  onEndedDelete?: (doc: MemberSubscriptionDoc) => void;
};

export function LiveSubscriptionCard({
  doc,
  viewerUid,
  viewerAvatarUrl,
  lastSeenPriceMap,
  muted,
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

  const savedAmount = useMemo(() => {
    if (splitEnded) return undefined;
    const totalCents = getTotalCents(doc);
    const memberAmountCents = getMemberAmountCents(doc, viewerUid);
    const savingsCents = totalCents - memberAmountCents;
    return savingsCents > 0 ? formatUsdDollarsFixed2(savingsCents / 100) : undefined;
  }, [doc, viewerUid, splitEnded]);

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

  const onDeleteSplit = () =>
    onEndedDelete
      ? onEndedDelete(doc)
      : Alert.alert('Delete', 'This will be available when subscription management is connected.');

  return (
    <SubscriptionCard
      {...base}
      savedAmount={savedAmount}
      faded={splitEnded}
      hideEditSplit={splitEnded}
      splitEndedActions={
        splitEnded && isOwner
          ? {
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
