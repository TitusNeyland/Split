import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import { fmtCents } from '../../lib/subscription/addSubscriptionSplitMath';
import { subscribeMemberSubscriptions, type MemberSubscriptionDoc } from '../../lib/subscription/memberSubscriptionsFirestore';
import {
  getTotalCents,
  getViewerShareCents,
  normalizeSubscriptionStatus,
  subscriptionIsUserOverdue,
} from '../../lib/subscription/subscriptionToCardModel';
import { subscribeAuthAndProfile } from '../../lib/profile';
import { SUBSCRIPTIONS_DEMO_MODE, DEMO_TAB_BADGES } from '../../lib/subscription/subscriptionsScreenDemo';
import { SubscriptionsDemoFloatCard, SubscriptionsDemoPanel } from '../components/subscriptions/SubscriptionsDemoPanels';
import { LiveSubscriptionCard } from '../components/subscriptions/LiveSubscriptionCard';
import { SubscriptionCardSkeletonList } from '../components/subscriptions/SubscriptionCardSkeleton';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import { spacing } from '../../constants/theme';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  red: '#E24B4A',
  text: '#1a1a18',
  muted: '#888780',
};

type FilterId = 'active' | 'overdue' | 'paused' | 'archived';

const FILTERS: { id: FilterId; label: string; badge?: 'overdue' | 'paused' }[] = [
  { id: 'active', label: 'Active' },
  { id: 'overdue', label: 'Overdue', badge: 'overdue' },
  { id: 'paused', label: 'Paused', badge: 'paused' },
  { id: 'archived', label: 'Archived' },
];

function formatBadgeCount(n: number): string {
  if (n > 99) return '99+';
  return String(n);
}

function heroMoneyLabel(cents: number): string {
  return fmtCents(Math.max(0, Math.round(cents)));
}

export default function SubscriptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [user, setUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<FilterId>('active');
  const [memberSubscriptions, setMemberSubscriptions] = useState<MemberSubscriptionDoc[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [lastSeenPriceMap, setLastSeenPriceMap] = useState<
    Record<string, { toMillis?: () => number }> | null | undefined
  >(null);

  const { avatarUrl: userAvatarUrl } = useProfileAvatarUrl();

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (SUBSCRIPTIONS_DEMO_MODE) {
      return;
    }
    return subscribeAuthAndProfile((s) => {
      setLastSeenPriceMap(s.profile?.lastSeenPriceChangeBySubscription ?? null);
    });
  }, []);

  useEffect(() => {
    if (SUBSCRIPTIONS_DEMO_MODE) {
      return;
    }
    const uid = user?.uid;
    if (!uid) {
      setMemberSubscriptions([]);
      setSubscriptionsLoading(false);
      return;
    }
    return subscribeMemberSubscriptions(uid, (subs, loading) => {
      setMemberSubscriptions(subs);
      setSubscriptionsLoading(loading);
    });
  }, [user?.uid]);

  const uid = user?.uid ?? '';

  const { activeSubs, overdueSubs, pausedSubs, archivedSubs } = useMemo(() => {
    const active: MemberSubscriptionDoc[] = [];
    const overdue: MemberSubscriptionDoc[] = [];
    const paused: MemberSubscriptionDoc[] = [];
    const archived: MemberSubscriptionDoc[] = [];
    for (const s of memberSubscriptions) {
      const st = normalizeSubscriptionStatus(s.status);
      if (st === 'archived' || st === 'cancelled') {
        archived.push(s);
        continue;
      }
      if (st === 'paused') {
        paused.push(s);
      }
      if (st === 'active') {
        active.push(s);
        if (uid && subscriptionIsUserOverdue(s, uid)) {
          overdue.push(s);
        }
      }
    }
    return { activeSubs: active, overdueSubs: overdue, pausedSubs: paused, archivedSubs: archived };
  }, [memberSubscriptions, uid]);

  const monthlyTotalCents = useMemo(
    () => activeSubs.reduce((sum, s) => sum + getTotalCents(s), 0),
    [activeSubs]
  );

  const yourShareCents = useMemo(
    () => activeSubs.reduce((sum, s) => sum + (uid ? getViewerShareCents(s, uid) : 0), 0),
    [activeSubs, uid]
  );

  const activeCount = activeSubs.length;

  const overdueBadge = SUBSCRIPTIONS_DEMO_MODE ? DEMO_TAB_BADGES.overdue : overdueSubs.length;
  const pausedBadge = SUBSCRIPTIONS_DEMO_MODE ? DEMO_TAB_BADGES.paused : pausedSubs.length;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <LinearGradient
          colors={['#6B3FA0', '#4A1570', '#2D0D45']}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4 }]}
        >
          <View style={styles.sbar}>
            <Text style={styles.pageTitle}>Subscriptions</Text>
            <View style={styles.sbarActions}>
              <Pressable
                style={styles.calIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Billing calendar"
                onPress={() => router.push('/billing-calendar')}
              >
                <Ionicons name="calendar-outline" size={22} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.addBtn}
                accessibilityRole="button"
                accessibilityLabel="Add subscription"
                onPress={() => router.push('/add-subscription')}
              >
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.hstat}>
              <Text style={styles.hstatVal}>
                {SUBSCRIPTIONS_DEMO_MODE ? '$127' : heroMoneyLabel(monthlyTotalCents)}
              </Text>
              <Text style={styles.hstatLbl}>Monthly total</Text>
            </View>
            <View style={styles.hstat}>
              <Text style={styles.hstatVal}>
                {SUBSCRIPTIONS_DEMO_MODE ? '$28' : heroMoneyLabel(yourShareCents)}
              </Text>
              <Text style={styles.hstatLbl}>Your share</Text>
            </View>
            <View style={styles.hstat}>
              <Text style={styles.hstatVal}>{SUBSCRIPTIONS_DEMO_MODE ? '4' : String(activeCount)}</Text>
              <Text style={styles.hstatLbl}>Active splits</Text>
            </View>
          </View>

          <View style={styles.seg} accessibilityRole="tablist" accessibilityLabel="Subscription filters">
            {FILTERS.map((f) => {
              const selected = filter === f.id;
              const badgeCount =
                f.badge === 'overdue'
                  ? overdueBadge
                  : f.badge === 'paused'
                    ? pausedBadge
                    : 0;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={styles.segBtn}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    f.badge && badgeCount > 0
                      ? `${f.label}, ${badgeCount} items`
                      : f.label
                  }
                >
                  <View style={[styles.segPill, selected && styles.segPillOn]}>
                    <View style={styles.segBtnInner}>
                      <Text
                        style={[
                          styles.segBtnTxt,
                          selected && styles.segBtnTxtOn,
                          f.id === 'archived' && styles.segBtnTxtArchived,
                        ]}
                        numberOfLines={1}
                      >
                        {f.label}
                      </Text>
                      {f.badge && badgeCount > 0 ? (
                        <View
                          style={[
                            styles.countPill,
                            f.badge === 'overdue' ? styles.countPillOverdue : styles.countPillPaused,
                          ]}
                        >
                          <Text style={styles.countPillTxt}>{formatBadgeCount(badgeCount)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>

        {SUBSCRIPTIONS_DEMO_MODE ? <SubscriptionsDemoFloatCard /> : null}

        <View style={[styles.body, { minHeight: Math.max(320, width * 0.9) }]}>
          {SUBSCRIPTIONS_DEMO_MODE ? (
            <SubscriptionsDemoPanel filter={filter} />
          ) : (
            <>
              {filter === 'active' ? (
                <View style={styles.panel}>
                  <View style={styles.sh}>
                    <Text style={styles.shTitle}>Active splits</Text>
                    <Text style={styles.shAction}>Sort</Text>
                  </View>
                  {subscriptionsLoading && uid ? (
                    <SubscriptionCardSkeletonList count={3} />
                  ) : !uid ? (
                    <Text style={styles.panelHint}>Sign in to see your subscription splits.</Text>
                  ) : activeSubs.length === 0 ? (
                    <View style={styles.empty}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="archive-outline" size={30} color={C.muted} />
                      </View>
                      <Text style={styles.emptyTitle}>No active splits yet</Text>
                      <Text style={styles.emptySub}>
                        Tap + Add to create your first subscription split
                      </Text>
                      <Pressable
                        style={styles.emptyAddBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Add subscription"
                        onPress={() => router.push('/add-subscription')}
                      >
                        <Text style={styles.emptyAddBtnTxt}>+ Add</Text>
                      </Pressable>
                    </View>
                  ) : (
                    activeSubs.map((doc) => (
                      <LiveSubscriptionCard
                        key={doc.id}
                        doc={doc}
                        viewerUid={uid}
                        viewerAvatarUrl={userAvatarUrl}
                        lastSeenPriceMap={lastSeenPriceMap}
                      />
                    ))
                  )}
                </View>
              ) : null}

              {filter === 'overdue' ? (
                <View style={styles.panel}>
                  <View style={styles.sh}>
                    <Text style={styles.shTitle}>Needs attention</Text>
                  </View>
                  {subscriptionsLoading && uid ? (
                    <SubscriptionCardSkeletonList count={2} />
                  ) : !uid ? (
                    <Text style={styles.panelHint}>Sign in to see overdue payments.</Text>
                  ) : overdueSubs.length === 0 ? (
                    <Text style={styles.panelHint}>
                      Nothing overdue. Subscriptions with a member payment past due will show here.
                    </Text>
                  ) : (
                    overdueSubs.map((doc) => (
                      <LiveSubscriptionCard
                        key={doc.id}
                        doc={doc}
                        viewerUid={uid}
                        viewerAvatarUrl={userAvatarUrl}
                        lastSeenPriceMap={lastSeenPriceMap}
                      />
                    ))
                  )}
                </View>
              ) : null}

              {filter === 'paused' ? (
                <View style={styles.panel}>
                  <View style={styles.sh}>
                    <Text style={styles.shTitle}>Paused</Text>
                  </View>
                  {subscriptionsLoading && uid ? (
                    <SubscriptionCardSkeletonList count={2} />
                  ) : !uid ? (
                    <Text style={styles.panelHint}>Sign in to see paused subscriptions.</Text>
                  ) : pausedSubs.length === 0 ? (
                    <Text style={styles.panelHint}>
                      No paused subscriptions. Paused splits will appear here.
                    </Text>
                  ) : (
                    pausedSubs.map((doc) => (
                      <LiveSubscriptionCard
                        key={doc.id}
                        doc={doc}
                        viewerUid={uid}
                        viewerAvatarUrl={userAvatarUrl}
                        lastSeenPriceMap={lastSeenPriceMap}
                        muted
                      />
                    ))
                  )}
                </View>
              ) : null}

              {filter === 'archived' ? (
                <View style={styles.panel}>
                  {archivedSubs.length === 0 ? (
                    <View style={styles.empty}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="archive-outline" size={30} color={C.muted} />
                      </View>
                      <Text style={styles.emptyTitle}>No archived subscriptions</Text>
                      <Text style={styles.emptySub}>Cancelled subscriptions{'\n'}will appear here</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.sh}>
                        <Text style={styles.shTitle}>Archived</Text>
                      </View>
                      <Text style={styles.panelHint}>
                        {archivedSubs.length} archived subscription{archivedSubs.length === 1 ? '' : 's'} — list
                        coming soon.
                      </Text>
                    </>
                  )}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  addBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
  },
  addBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.purple,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  hstat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  hstatVal: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
    letterSpacing: -0.4,
  },
  hstatLbl: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 6,
    gap: 6,
    alignItems: 'center',
  },
  segBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingVertical: 6,
  },
  /** Wraps label; only the selected tab gets the white pill (not full column width). */
  segPill: {
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 14,
    maxWidth: '100%',
  },
  segPillOn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  segBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    maxWidth: '100%',
  },
  segBtnTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  segBtnTxtOn: {
    color: C.purple,
  },
  segBtnTxtArchived: {
    fontSize: 11.5,
    letterSpacing: -0.15,
  },
  countPill: {
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillOverdue: {
    backgroundColor: C.red,
  },
  countPillPaused: {
    backgroundColor: '#8A8984',
  },
  countPillTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 80,
    flexGrow: 1,
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
  panelHint: {
    fontSize: 17,
    color: C.muted,
    lineHeight: 24,
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
    fontSize: 18,
    fontWeight: '500',
    color: C.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  emptyAddBtn: {
    backgroundColor: C.purple,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  emptyAddBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
