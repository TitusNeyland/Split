import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { formatUsdDollarsFixed2 } from '../../lib/format/currency';
import type { MemberSubscriptionDoc } from '../../lib/subscription/memberSubscriptionsFirestore';
import { getOwnerId } from '../../lib/subscription/subscriptionToCardModel';
import { getMemberPaymentStatusNormalized } from '../../lib/subscription/subscriptionDerivedMetrics';
import { getNextFirstChargeDate } from '../../lib/subscription/billingDayFormat';
import { parseFirestoreBillingCycle, subscriptionDisplayName } from '../../lib/subscription/subscriptionBillingShared';

export type YouOweBannerProps = {
  youOweCents: number;
  subscriptions: MemberSubscriptionDoc[];
  currentUserUid: string;
  onPayNowPress: () => void;
};

/**
 * Find the split where user owes that has the soonest billing date.
 * Returns { subscriptionId, isOverdue, serviceName } or null.
 */
function findMostUrgentSplitOwed(
  subscriptions: MemberSubscriptionDoc[],
  currentUid: string
): { subscriptionId: string; isOverdue: boolean; serviceName: string } | null {
  if (!currentUid) return null;

  let mostUrgent: {
    subscriptionId: string;
    isOverdue: boolean;
    serviceName: string;
    nextBillingDate: Date;
  } | null = null;

  for (const doc of subscriptions) {
    const sub = doc as Record<string, unknown>;

    // Only for subscriptions where user is NOT owner and owes money
    if (getOwnerId(sub) === currentUid) continue;

    const st = getMemberPaymentStatusNormalized(sub, currentUid);
    if (st !== 'pending' && st !== 'overdue') continue;

    // Get next billing date
    const cycle = parseFirestoreBillingCycle(sub.billingCycle);
    const label = sub.billingDayLabel;
    if (typeof label !== 'string' || !label.trim()) continue;

    const nextBillingDate = getNextFirstChargeDate(cycle, label);
    if (!nextBillingDate) continue;

    // Check if this is the most urgent (soonest) so far
    if (!mostUrgent || nextBillingDate < mostUrgent.nextBillingDate) {
      const serviceName = subscriptionDisplayName(
        typeof sub.serviceName === 'string' ? sub.serviceName : '',
        typeof sub.planName === 'string' ? sub.planName : undefined
      );
      const isOverdue = st === 'overdue';
      mostUrgent = {
        subscriptionId: sub.id as string,
        isOverdue,
        serviceName,
        nextBillingDate,
      };
    }
  }

  return mostUrgent
    ? {
        subscriptionId: mostUrgent.subscriptionId,
        isOverdue: mostUrgent.isOverdue,
        serviceName: mostUrgent.serviceName,
      }
    : null;
}

export function YouOweBanner({
  youOweCents,
  subscriptions,
  currentUserUid,
  onPayNowPress,
}: YouOweBannerProps) {
  const urgentSplit = useMemo(
    () => findMostUrgentSplitOwed(subscriptions, currentUserUid),
    [subscriptions, currentUserUid]
  );

  // Hide banner if no amount owed or no urgent split found
  if (youOweCents <= 0 || !urgentSplit) {
    return null;
  }

  const youOwe = youOweCents / 100;
  const subtitle = urgentSplit.isOverdue ? 'Overdue · tap to pay' : 'Due soon · tap to pay';

  return (
    <View style={styles.banner}>
      <View style={styles.bannerLeft}>
        <Text style={styles.oweTitle}>
          You owe · {urgentSplit.serviceName}
        </Text>
        <Text style={styles.oweSub}>{subtitle}</Text>
      </View>
      <Text style={styles.oweAmt}>{formatUsdDollarsFixed2(youOwe)}</Text>
      <TouchableOpacity style={styles.payBtn} onPress={onPayNowPress}>
        <Text style={styles.payBtnTxt}>Pay</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    gap: 12,
  },
  bannerLeft: {
    flex: 1,
    minWidth: 0,
  },
  oweTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a18',
    marginBottom: 2,
  },
  oweSub: {
    fontSize: 11,
    color: 'rgba(26, 26, 24, 0.6)',
    marginTop: 2,
  },
  oweAmt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
    marginHorizontal: 8,
  },
  payBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EF4444',
    borderRadius: 6,
  },
  payBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
