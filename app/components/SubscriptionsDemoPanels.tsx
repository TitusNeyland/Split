import React, { useMemo } from 'react';
;
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionCard } from './SubscriptionCard';
import { ServiceIcon } from './ServiceIcon';
import { SUBSCRIPTIONS_DEMO_MODE } from '../../lib/subscriptionsScreenDemo';
import { useSubscriptionPriceBanner } from '../../lib/useSubscriptionPriceBanner';
import { useFirebaseUid } from '../../lib/useFirebaseUid';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import {
  perPersonAmountLabelEqualSplit,
  type SubscriptionPriceBannerFields,
} from '../../lib/subscriptionPriceChangeBanner';

const C = {
  purple: '#534AB7',
  red: '#E24B4A',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  green: '#1D9E75',
  greenDark: '#0F6E56',
  orange: '#EF9F27',
  brown: '#854F0B',
  cream: '#FAEEDA',
  divider: '#F0EEE9',
};

type FilterId = 'active' | 'overdue' | 'paused' | 'archived';

function Pip({ initials, bg, color }: { initials: string; bg: string; color: string }) {
  return (
    <View style={[styles.pip, { backgroundColor: bg }]}>
      <Text style={[styles.pipTxt, { color }]}>{initials}</Text>
    </View>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.progTrack}>
      <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function SubscriptionsDemoFloatCard() {
  return (
    <View style={styles.floatCard}>
      <ServiceIcon serviceName="Netflix" size={40} style={styles.serviceIconTile} />
      <View style={styles.fcMid}>
        <Text style={styles.fcTitle}>Netflix bills today</Text>
        <Text style={styles.fcSub}>2 of 3 members have paid · Sam still pending</Text>
      </View>
      <Pressable style={styles.nudgeBtn} accessibilityRole="button" accessibilityLabel="Nudge">
        <Text style={styles.nudgeBtnTxt}>Nudge</Text>
      </Pressable>
    </View>
  );
}

function OwnerBadgeRow() {
  return (
    <View style={styles.ownerBadge}>
      <Ionicons name="person-outline" size={10} color={C.purple} />
      <Text style={styles.ownerBadgeTxt}>You pay</Text>
    </View>
  );
}

/** Stable “changed at” for demo banner logic (auto-dismiss uses billing day 18). */
const DEMO_NETFLIX_PRICE_CHANGED_AT_MS = 1_712_707_200_000;

const NETFLIX_TOTAL_CENTS = 2299;
const NETFLIX_MEMBER_COUNT = 3;

function demoNetflixPriceBannerFields(): SubscriptionPriceBannerFields {
  return {
    priceChangedAt: { toMillis: () => DEMO_NETFLIX_PRICE_CHANGED_AT_MS },
    priceChangeFromCents: 1999,
    priceChangeToCents: NETFLIX_TOTAL_CENTS,
    billingDayOfMonth: 18,
  };
}

function NetflixCard({ userAvatarUrl }: { userAvatarUrl: string | null }) {
  const router = useRouter();
  const uid = useFirebaseUid();
  const netflixPriceSub = useMemo(() => demoNetflixPriceBannerFields(), []);
  const goDetail = () => router.push('/subscription/demo-netflix-premium');

  const { visible: priceBannerVisible, message: priceBannerMessage, dismiss: dismissPriceBanner } =
    useSubscriptionPriceBanner({
      subscriptionId: 'demo-netflix-premium',
      uid,
      subscription: netflixPriceSub,
      userLastSeenPriceChangeMs: null,
      skipFirestore: SUBSCRIPTIONS_DEMO_MODE,
    });

  const onDismissPriceBanner = () => {
    void dismissPriceBanner().catch((e) =>
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e))
    );
  };

  return (
    <SubscriptionCard
      priceChange={
        priceBannerVisible
          ? {
              message: priceBannerMessage,
              onDismiss: onDismissPriceBanner,
            }
          : undefined
      }
      serviceName="Netflix Premium"
      name="Netflix Premium"
      cycleLine="Monthly · Mar 18"
      isOwner
      autoCharge="on"
      totalAmount="$22.99"
      perPersonAmount={perPersonAmountLabelEqualSplit(NETFLIX_TOTAL_CENTS, NETFLIX_MEMBER_COUNT)}
      members={[
        { id: '1', initials: 'TN', backgroundColor: '#EEEDFE', color: C.purple, avatarUrl: userAvatarUrl },
        { id: '2', initials: 'AL', backgroundColor: '#E1F5EE', color: C.greenDark },
        { id: '3', initials: 'SM', backgroundColor: '#FAECE7', color: '#993C1D' },
      ]}
      statusPill={{
        backgroundColor: C.cream,
        dotColor: C.orange,
        label: '1 pending',
        textColor: C.brown,
      }}
      dueLabel="Today"
      progress={{
        percentCollected: Math.round((100 * 1533) / 2299),
        collectedLabel: '$15.33 collected',
        rightLabel: '$22.99',
      }}
      onCardPress={goDetail}
      onEditSplitPress={goDetail}
    />
  );
}

function SpotifyCard({ userAvatarUrl }: { userAvatarUrl: string | null }) {
  const router = useRouter();
  const goDetail = () => router.push('/subscription/demo-spotify-family');

  return (
    <SubscriptionCard
      serviceName="Spotify Family"
      name="Spotify Family"
      cycleLine="Monthly · Mar 25"
      autoCharge="on"
      totalAmount="$16.99"
      perPersonAmount="$3.40/person"
      members={[
        { id: '1', initials: 'TN', backgroundColor: '#EEEDFE', color: C.purple, avatarUrl: userAvatarUrl },
        { id: '2', initials: 'AL', backgroundColor: '#E1F5EE', color: C.greenDark },
        { id: '3', initials: 'SM', backgroundColor: '#FAECE7', color: '#993C1D' },
        { id: '4', initials: 'TR', backgroundColor: '#E6F1FB', color: '#185FA5' },
        { id: '5', initials: 'KP', backgroundColor: '#EAF3DE', color: '#3B6D11' },
      ]}
      statusPill={{
        backgroundColor: '#E1F5EE',
        dotColor: C.green,
        label: 'All paid',
        textColor: C.greenDark,
      }}
      dueLabel="7 days"
      progress={{
        percentCollected: 100,
        collectedLabel: '$16.99 collected',
        rightLabel: 'Complete',
        isComplete: true,
      }}
      onCardPress={goDetail}
      onEditSplitPress={goDetail}
    />
  );
}

function ICloudCard({ userAvatarUrl }: { userAvatarUrl: string | null }) {
  const router = useRouter();
  const goDetail = () => router.push('/subscription/demo-icloud-2tb');

  return (
    <SubscriptionCard
      serviceName="iCloud 2TB"
      name="iCloud 2TB"
      cycleLine="Monthly · Apr 3"
      autoCharge="off"
      totalAmount="$9.99"
      perPersonAmount="$2.50/person"
      members={[
        { id: '1', initials: 'TN', backgroundColor: '#EEEDFE', color: C.purple, avatarUrl: userAvatarUrl },
        { id: '2', initials: 'AL', backgroundColor: '#E1F5EE', color: C.greenDark },
        { id: '3', initials: 'SM', backgroundColor: '#FAECE7', color: '#993C1D' },
        { id: '4', initials: 'TR', backgroundColor: '#E6F1FB', color: '#185FA5' },
      ]}
      statusPill={{
        backgroundColor: '#F0EEE9',
        dotColor: C.muted,
        label: 'Not started',
        textColor: '#5F5E5A',
      }}
      dueLabel="17 days"
      progress={{
        percentCollected: 0,
        collectedLabel: '$0 collected',
        rightLabel: '$9.99',
        rightLabelColor: C.muted,
        barColor: C.muted,
      }}
      onCardPress={goDetail}
      onEditSplitPress={goDetail}
    />
  );
}

function HuluOverdueCard() {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.subCard, styles.subCardOverdue]}
      onPress={() => router.push('/subscription/demo-hulu-overdue')}
      accessibilityRole="button"
      accessibilityLabel="Open Hulu subscription details"
    >
      <View style={styles.overdueBanner}>
        <Ionicons name="alert-circle-outline" size={12} color="#A32D2D" />
        <Text style={styles.overdueBannerTxt}>3 days overdue — Sam hasn&apos;t paid $4.00</Text>
        <Pressable style={styles.remindBtn} accessibilityRole="button" accessibilityLabel="Remind member">
          <Text style={styles.remindBtnTxt}>Remind</Text>
        </Pressable>
      </View>
      <View style={styles.subMain}>
        <View style={styles.subTop}>
          <ServiceIcon serviceName="Hulu" size={40} style={styles.serviceIconTile} />
          <View style={styles.subInfo}>
            <Text style={styles.subName}>Hulu</Text>
            <View style={styles.subMetaRow}>
              <Text style={styles.subCycle}>Monthly · billed Mar 12</Text>
              <OwnerBadgeRow />
            </View>
          </View>
          <View>
            <Text style={[styles.subTotal, { color: C.red }]}>$7.99</Text>
            <Text style={styles.subPer}>$4.00/person</Text>
          </View>
        </View>
        <View style={styles.memberRow}>
          <View style={styles.pips}>
            <Pip initials="JD" bg="#EEEDFE" color={C.purple} />
            <Pip initials="SM" bg="#FAECE7" color="#993C1D" />
          </View>
          <View style={[styles.statusPill, { backgroundColor: '#FCEBEB' }]}>
            <View style={[styles.statusDot, { backgroundColor: C.red }]} />
            <Text style={[styles.statusTxt, { color: '#A32D2D' }]}>Overdue</Text>
          </View>
        </View>
        <View style={styles.progWrap}>
          <ProgressBar pct={50} color={C.red} />
          <View style={styles.progLabels}>
            <Text style={styles.progLbl}>$4.00 of $7.99</Text>
            <Text style={[styles.progAmt, { color: C.red }]}>$3.99 missing</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function XboxPausedCard() {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.subCard, styles.subCardPaused]}
      onPress={() => router.push('/subscription/demo-xbox-paused')}
      accessibilityRole="button"
      accessibilityLabel="Open Xbox Game Pass subscription details"
    >
      <View style={styles.pausedBanner}>
        <Ionicons name="pause" size={12} color="#5F5E5A" />
        <Text style={styles.pausedBannerTxt}>Paused · skipping billing cycles</Text>
        <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel="Resume subscription">
          <Text style={styles.resumeTxt}>Resume</Text>
        </Pressable>
      </View>
      <View style={styles.subMain}>
        <View style={styles.subTop}>
          <ServiceIcon serviceName="Xbox Game Pass" size={40} style={styles.serviceIconTile} />
          <View style={styles.subInfo}>
            <Text style={[styles.subName, { color: C.muted }]}>Xbox Game Pass</Text>
            <View style={styles.subMetaRow}>
              <Text style={styles.subCycle}>Monthly · was Apr 1</Text>
            </View>
          </View>
          <View>
            <Text style={[styles.subTotal, { color: C.muted }]}>$14.99</Text>
            <Text style={styles.subPer}>$7.50/person</Text>
          </View>
        </View>
        <View style={styles.memberRow}>
          <View style={styles.pips}>
            <Pip initials="JD" bg="#F0EEE9" color={C.muted} />
            <Pip initials="TR" bg="#F0EEE9" color={C.muted} />
          </View>
          <View style={[styles.statusPill, { backgroundColor: '#F0EEE9' }]}>
            <View style={[styles.statusDot, { backgroundColor: C.muted }]} />
            <Text style={[styles.statusTxt, { color: '#5F5E5A' }]}>Paused</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function SubscriptionsDemoPanel({ filter }: { filter: FilterId }) {
  const { avatarUrl: userAvatarUrl } = useProfileAvatarUrl();

  if (filter === 'active') {
    return (
      <View style={styles.panel}>
        <View style={styles.sh}>
          <Text style={styles.shTitle}>Active splits</Text>
          <Text style={styles.shAction}>Sort</Text>
        </View>
        <NetflixCard userAvatarUrl={userAvatarUrl} />
        <SpotifyCard userAvatarUrl={userAvatarUrl} />
        <ICloudCard userAvatarUrl={userAvatarUrl} />
      </View>
    );
  }
  if (filter === 'overdue') {
    return (
      <View style={styles.panel}>
        <View style={styles.sh}>
          <Text style={styles.shTitle}>Needs attention</Text>
        </View>
        <HuluOverdueCard />
      </View>
    );
  }
  if (filter === 'paused') {
    return (
      <View style={styles.panel}>
        <View style={styles.sh}>
          <Text style={styles.shTitle}>Paused</Text>
        </View>
        <XboxPausedCard />
      </View>
    );
  }
  return (
    <View style={styles.panel}>
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="file-tray-stacked-outline" size={28} color={C.muted} />
        </View>
        <Text style={styles.emptyTitle}>No archived subscriptions</Text>
        <Text style={styles.emptySub}>Cancelled subscriptions{'\n'}will appear here</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Align with `SubscriptionCard` / design spec: 40×40, 12px corners. */
  serviceIconTile: {
    borderRadius: 12,
  },
  floatCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    marginHorizontal: 14,
    marginTop: -18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  fcIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcMid: { flex: 1, minWidth: 0 },
  fcTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  fcSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  nudgeBtn: {
    backgroundColor: C.purple,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },
  nudgeBtnTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  panel: {
    paddingTop: 4,
  },
  sh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
  },
  shTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  shAction: {
    fontSize: 16,
    color: C.purple,
    fontWeight: '500',
  },
  subCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  subCardOverdue: {
    borderColor: '#F09595',
  },
  subCardPaused: {
    borderColor: '#D3D1C7',
    opacity: 0.95,
  },
  overdueBanner: {
    backgroundColor: '#FCEBEB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  overdueBannerTxt: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#A32D2D',
  },
  remindBtn: {
    backgroundColor: C.red,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  remindBtnTxt: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  pausedBanner: {
    backgroundColor: '#F5F3EE',
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pausedBannerTxt: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#5F5E5A',
  },
  resumeTxt: {
    fontSize: 11,
    fontWeight: '500',
    color: C.purple,
  },
  subMain: {
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  subTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
  },
  subIco: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subEmoji: {
    fontSize: 18,
  },
  subInfo: {
    flex: 1,
    minWidth: 0,
  },
  subName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.2,
  },
  subMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  subCycle: {
    fontSize: 11,
    color: C.muted,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEEDFE',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  ownerBadgeTxt: {
    fontSize: 10,
    fontWeight: '500',
    color: C.purple,
  },
  subTotal: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  subPer: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pips: {
    flexDirection: 'row',
  },
  pip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pipTxt: {
    fontSize: 9,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusTxt: {
    fontSize: 10,
    fontWeight: '500',
  },
  progWrap: {
    marginTop: 0,
  },
  progTrack: {
    height: 3,
    backgroundColor: '#F0EEE9',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progFill: {
    height: 3,
    borderRadius: 2,
  },
  progLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progLbl: {
    fontSize: 10,
    color: C.muted,
  },
  progAmt: {
    fontSize: 10,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
