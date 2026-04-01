import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { spacing } from '../../constants/theme';
import { formatUsdDollarsFixed2 } from '../../lib/format/currency';
import { getFriendAvatarColors } from '../../lib/friends/friendAvatar';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { initialsFromName } from '../../lib/profile';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import { UserAvatarCircle } from '../components/shared/UserAvatarCircle';
import type { HomeFinancialPosition } from '../../lib/home/homeFinancialPositionFirestore';
import {
  formatMemberTenureMonths,
  subscribeHomeSavings,
  type HomeSavingsSnapshot,
} from '../../lib/home/homeSavingsFirestore';
import { getTotalCents } from '../../lib/subscription/subscriptionToCardModel';
import {
  computeFriendBalances,
  computeHomeFinancialFromSubscriptions,
  computeHomeFloatCard,
  computeUpcomingSplits,
} from '../../lib/home/homeSubscriptionMath';
import {
  buildCalendarDays,
  formatBillingDetailLine,
  formatHomeBillWhenLabel,
  getDotColorForSubscription,
  getUpcomingBillingDates,
  subscriptionDisplayLabel,
  type HomeCalendarDayCell,
} from '../../lib/home/homeBillingCalendar';
import { subscribeHomeRecentActivity, type HomeRecentActivityFirestoreItem } from '../../lib/home/homeRecentActivityFirestore';
import {
  resetUnreadNotificationCount,
  subscribeHomeNotifications,
  type AppNotification,
} from '../../lib/home/homeNotificationsFirestore';
import HomeNotificationsPanel from '../components/home/HomeNotificationsPanel';
import { useHomeFriendDirectory } from '../../lib/home/useFriendUidsFromFirestore';
import { useSubscriptions } from '../contexts/SubscriptionsContext';
import { HomeDonutChart, HOME_DONUT_SIZE } from '../components/home/HomeDonutChart';
import { HomeFloatCard } from '../components/home/HomeFloatCard';
import { HomeHeroDonutLegend } from '../components/home/HomeHeroDonutLegend';
import { HomeSavingsPill } from '../components/home/HomeSavingsPill';
import { HomeQuickActionsRow } from '../components/home/HomeQuickActionsRow';
import {
  HomeReminderPickerModal,
  type ReminderPickCandidate,
} from '../components/home/HomeReminderPickerModal';
import { ServiceIcon } from '../components/shared/ServiceIcon';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  red: '#E24B4A',
  green: '#1D9E75',
  orange: '#EF9F27',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F0EEE9',
  rowDivider: '#F5F3EE',
};

/** Rounded square corners for 38×38 tiles; matches `ServiceIcon` (`size * 0.28`). */
const SERVICE_TILE_RADIUS = Math.round(38 * 0.28);

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good evening';
}

type FriendRow = {
  id: string;
  initials: string;
  name: string;
  subLine: string;
  balanceLabel: string;
  balanceColor: string;
  actionLabel: string;
};

type SplitRow = {
  id: string;
  name: string;
  meta: string;
  total: number;
  status: string;
  statusColor: string;
  serviceName: string;
};

type HomeRecentActivityItem = {
  id: string;
  title: string;
  timestamp: string;
  amount: string;
  amountColor: string;
  serviceMark?: string;
  serviceId?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  serviceIconMuted?: boolean;
  friendAvatar?: { initials: string; imageUrl?: string | null };
  viewerAvatarUrl?: string | null;
};

export default function HomeScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const { subscriptions, loading: subscriptionsLoading } = useSubscriptions();
  const { friendUids, displayNameByUid } = useHomeFriendDirectory(user?.uid ?? null);
  const { avatarUrl: homeAvatarUrl, displayName: homeDisplayName, profileLoading: homeProfileLoading } =
    useProfileAvatarUrl();
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);
  const [savings, setSavings] = useState<HomeSavingsSnapshot>({ lifetimeSaved: 0, joinedAt: null });
  const [recentActivityItems, setRecentActivityItems] = useState<HomeRecentActivityItem[]>([]);
  const [panelNotifications, setPanelNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<HomeCalendarDayCell | null>(null);
  const [greeting, setGreeting] = useState(() => getGreeting());

  const uid = user?.uid ?? '';
  const hasSubscriptions = subscriptions.length > 0;
  const isEmpty = Boolean(uid) && !subscriptionsLoading && !hasSubscriptions;

  const financial = useMemo(() => {
    if (!uid) return { youOwe: 0, owedToYou: 0, overdue: 0 };
    return computeHomeFinancialFromSubscriptions(subscriptions, uid);
  }, [subscriptions, uid]);

  const position: HomeFinancialPosition = useMemo(
    () => ({
      ...financial,
      loading: Boolean(uid && subscriptionsLoading),
    }),
    [financial, uid, subscriptionsLoading]
  );

  const floatModel = useMemo(() => computeHomeFloatCard(subscriptions, uid), [subscriptions, uid]);

  const notifCount = useMemo(
    () => panelNotifications.filter((n) => !n.read).length,
    [panelNotifications]
  );
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const u = user?.uid;
    if (!u) {
      setSavings({ lifetimeSaved: 0, joinedAt: null });
      return;
    }
    return subscribeHomeSavings(u, user, setSavings);
  }, [user?.uid, user]);

  useEffect(() => {
    if (!uid) {
      setRecentActivityItems([]);
      return;
    }
    return subscribeHomeRecentActivity(uid, (items: HomeRecentActivityFirestoreItem[]) => {
      setRecentActivityItems(
        items.map((x) => ({
          id: x.id,
          title: x.title,
          timestamp: x.timestamp,
          amount: x.amount,
          amountColor: x.amountColor,
          serviceMark: x.serviceMark,
          serviceId: x.serviceId,
          icon: x.icon,
          iconBg: x.iconBg,
          iconColor: x.iconColor,
          serviceIconMuted: x.serviceIconMuted,
          friendAvatar: x.friendAvatar,
        }))
      );
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setPanelNotifications([]);
      setNotificationsLoading(false);
      return;
    }
    setNotificationsLoading(true);
    return subscribeHomeNotifications(uid, (items) => {
      setPanelNotifications(items);
      setNotificationsLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    if (!notifPanelOpen || !uid) return;
    void resetUnreadNotificationCount(uid).catch(() => {});
  }, [notifPanelOpen, uid]);

  const savingsMonthsLabel = useMemo(() => formatMemberTenureMonths(savings.joinedAt), [savings.joinedAt]);

  const CAL_STRIP_DAYS = 21;

  const billingDates = useMemo(
    () => getUpcomingBillingDates(subscriptions, { viewerUid: uid }),
    [subscriptions, uid]
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(billingDates, CAL_STRIP_DAYS, new Date()),
    [billingDates]
  );

  const nextBill = useMemo(() => billingDates[0] ?? null, [billingDates]);

  const nextBillWhen = useMemo(() => {
    if (!nextBill) return null;
    return formatHomeBillWhenLabel(nextBill.date, new Date());
  }, [nextBill]);

  useEffect(() => {
    setSelectedCalendarDay(null);
  }, [subscriptions]);

  const upcomingSplits = useMemo(() => (uid ? computeUpcomingSplits(subscriptions, uid, 3) : []), [
    subscriptions,
    uid,
  ]);

  const friendBalances = useMemo((): FriendRow[] => {
    if (!uid) return [];
    const rows = computeFriendBalances(subscriptions, uid, friendUids);
    return rows.slice(0, 4).map((r) => {
      const name = displayNameByUid[r.friendUid] ?? 'Friend';
      const initials = initialsFromName(name);
      const they = r.theyOweMeCents / 100;
      const owe = r.iOweThemCents / 100;
      let balanceLabel: string;
      let balanceColor: string;
      let actionLabel: string;
      let subLine: string;
      if (r.theyOweMeCents > 0) {
        balanceLabel = `owes ${formatUsdDollarsFixed2(they)}`;
        balanceColor = C.red;
        actionLabel = 'send reminder';
        subLine = 'Subscription split';
      } else if (r.iOweThemCents > 0) {
        balanceLabel = `you owe ${formatUsdDollarsFixed2(owe)}`;
        balanceColor = C.purple;
        actionLabel = 'settle up';
        subLine = 'Subscription split';
      } else {
        balanceLabel = 'settled';
        balanceColor = C.green;
        actionLabel = 'all clear';
        subLine = 'No pending splits';
      }
      return {
        id: r.friendUid,
        initials,
        name,
        subLine,
        balanceLabel,
        balanceColor,
        actionLabel,
      };
    });
  }, [subscriptions, uid, friendUids, displayNameByUid]);

  const recentActivity = recentActivityItems;

  const greetingName = useMemo(() => {
    if (isFirebaseConfigured() && homeDisplayName) {
      const first = homeDisplayName.split(/\s+/)[0];
      return first && first.length > 0 ? first : 'there';
    }
    return 'there';
  }, [homeDisplayName]);

  useFocusEffect(
    useCallback(() => {
      setGreeting(getGreeting());
    }, []),
  );

  const homeHeaderInitials = useMemo(() => {
    const n = homeDisplayName ?? user?.displayName ?? 'Me';
    return initialsFromName(n);
  }, [homeDisplayName, user?.displayName]);

  const reminderCandidates = useMemo((): ReminderPickCandidate[] => [], []);

  const onInviteFriend = useCallback(() => {
    router.push('/invite-share');
  }, [router]);

  const homeQuickActions = useMemo(
    () => [
      {
        id: 'scan',
        label: 'Scan receipt',
        icon: 'phone-portrait-outline' as const,
        circleBg: '#EEEDFE',
        iconColor: C.purple,
        onPress: () => router.push('/scan'),
      },
      {
        id: 'add',
        label: 'Add sub',
        icon: 'time-outline' as const,
        circleBg: '#E1F5EE',
        iconColor: '#0F6E56',
        onPress: () => router.push('/add-subscription'),
      },
      {
        id: 'find-friends',
        label: 'Find friends',
        icon: 'people-outline' as const,
        circleBg: '#E6F1FB',
        iconColor: '#185FA5',
        onPress: () => router.push('/friends'),
      },
      {
        id: 'invite',
        label: 'Invite friend',
        icon: 'people-outline' as const,
        circleBg: '#FAEEDA',
        iconColor: '#854F0B',
        onPress: onInviteFriend,
      },
      {
        id: 'remind',
        label: 'Send reminder',
        icon: 'notifications-outline' as const,
        circleBg: '#FFE8E2',
        iconColor: '#E24B4A',
        onPress: () => setReminderPickerOpen(true),
      },
    ],
    [router, onInviteFriend]
  );

  const onReminderPick = useCallback((c: ReminderPickCandidate) => {
    setReminderPickerOpen(false);
    Alert.alert('Reminder sent', `We'll remind ${c.name}.`);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <LinearGradient
          colors={['#6B3FA0', '#4A1570', '#2D0D45']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 8 }]}
        >
          <View style={styles.sbar}>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => router.push('/profile')}
            >
              {isFirebaseConfigured() && user ? (
                <UserAvatarCircle
                  size={28}
                  initials={homeHeaderInitials}
                  imageUrl={homeAvatarUrl}
                  loading={homeProfileLoading}
                  borderWidth={2}
                  borderColor="rgba(255,255,255,0.35)"
                />
              ) : (
                <Ionicons name="person-outline" size={22} color="rgba(255,255,255,0.65)" />
              )}
            </Pressable>
            <View style={styles.greetingWrap} accessibilityRole="text">
              <Text style={styles.greetingLabel} numberOfLines={1}>
                {greeting},
              </Text>
              <Text style={styles.greetingName} numberOfLines={1}>
                {greetingName}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => setNotifPanelOpen(true)}
            >
              <View>
                <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.88)" />
                {notifCount > 0 ? (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </View>

          <View style={styles.chartLegendRow}>
            <View style={styles.heroDonutWrap}>
              <HomeDonutChart
                youOwe={isEmpty ? 0 : position.youOwe}
                owedToYou={isEmpty ? 0 : position.owedToYou}
                overdue={isEmpty ? 0 : position.overdue}
                loading={!isEmpty && Boolean(user?.uid) && position.loading}
              />
            </View>
            <HomeHeroDonutLegend
              youOwe={isEmpty ? 0 : position.youOwe}
              owedToYou={isEmpty ? 0 : position.owedToYou}
              overdue={isEmpty ? 0 : position.overdue}
            />
          </View>
          {!isEmpty && savings.lifetimeSaved > 0.005 ? (
            <HomeSavingsPill savedDollars={savings.lifetimeSaved} monthsLabel={savingsMonthsLabel} />
          ) : null}
          {isEmpty ? (
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeTxt}>Add friends & subs{'\n'}to see balances</Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        <HomeFloatCard
          model={floatModel}
          hasSubscriptions={hasSubscriptions}
          loading={Boolean(uid && subscriptionsLoading)}
        />

        <View style={styles.quickActionsBelowFloat}>
          <HomeQuickActionsRow actions={homeQuickActions} />
        </View>

        <HomeReminderPickerModal
          visible={reminderPickerOpen}
          onClose={() => setReminderPickerOpen(false)}
          candidates={reminderCandidates}
          onSelect={onReminderPick}
        />

        <HomeNotificationsPanel
          visible={notifPanelOpen}
          onClose={() => setNotifPanelOpen(false)}
          uid={uid}
          displayName={homeDisplayName ?? user?.displayName ?? 'Member'}
          notifications={panelNotifications}
          loading={Boolean(uid) && notificationsLoading}
        />

        <View style={styles.body}>
          <View style={[styles.sh, styles.weekSectionHeader]}>
            <Text style={[styles.shTitle, styles.weekSectionTitle]}>This week</Text>
            <Pressable
              onPress={() => router.push('/billing-calendar')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open full billing calendar"
            >
              <Text style={[styles.shAction, styles.weekSectionAction]}>Full calendar</Text>
            </Pressable>
          </View>
          <View style={styles.calStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calDays}>
              {calendarDays.map((d) => (
                <Pressable
                  key={d.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.dayName} ${d.dayNum}${d.hasBill ? ', bills due' : ''}`}
                  onPress={() => {
                    if (!d.hasBill) {
                      setSelectedCalendarDay(null);
                      return;
                    }
                    setSelectedCalendarDay((prev) => (prev?.key === d.key ? null : d));
                  }}
                  style={[
                    styles.calDay,
                    d.isToday && styles.calDayToday,
                    d.hasBill && !d.isToday && styles.calDayBill,
                  ]}
                >
                  <Text
                    style={[
                      styles.calDayName,
                      d.isToday && styles.calDayNameOn,
                      d.hasBill && !d.isToday && styles.calDayNameBill,
                      !d.isToday && !d.hasBill && styles.calDayNamePlain,
                    ]}
                  >
                    {d.dayName}
                  </Text>
                  <Text
                    style={[
                      styles.calDayNum,
                      d.isToday && styles.calDayNumOn,
                      d.hasBill && !d.isToday && styles.calDayNumBill,
                      !d.isToday && !d.hasBill && styles.calDayNumPlain,
                    ]}
                  >
                    {d.dayNum}
                  </Text>
                  <View style={styles.calDotsRow}>
                    {[0, 1, 2].map((slot) => {
                      const bill = d.bills[slot];
                      if (bill) {
                        return (
                          <View
                            key={slot}
                            style={[
                              styles.calDotBrand,
                              { backgroundColor: getDotColorForSubscription(bill.subscription) },
                            ]}
                          />
                        );
                      }
                      return <View key={slot} style={styles.calDotPlaceholder} />;
                    })}
                    {d.bills.length > 3 ? (
                      <Text style={styles.calDotMore}>+{d.bills.length - 3}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            {selectedCalendarDay && selectedCalendarDay.bills.length > 0 ? (
              <View style={styles.selectedDayDetail}>
                {selectedCalendarDay.bills.map((bill) => {
                  const sub = bill.subscription;
                  const amt = getTotalCents(sub) / 100;
                  const name = subscriptionDisplayLabel(sub);
                  const iconName =
                    (typeof sub.serviceName === 'string' && sub.serviceName.trim()) ||
                    (typeof sub.serviceId === 'string' && sub.serviceId.trim()) ||
                    name;
                  const catalogSid =
                    typeof sub.serviceId === 'string' && sub.serviceId.trim()
                      ? sub.serviceId.trim()
                      : undefined;
                  return (
                    <Pressable
                      key={sub.id}
                      style={styles.billDetailRow}
                      onPress={() => router.push(`/subscription/${sub.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`${name}, open subscription`}
                    >
                      <View style={styles.bpIco}>
                        <ServiceIcon serviceName={iconName} serviceId={catalogSid} size={30} />
                      </View>
                      <Text style={styles.bpName} numberOfLines={2}>
                        {name}
                        <Text style={styles.bpBillingMeta}>
                          {' '}
                          · {formatBillingDetailLine(bill.date)}
                        </Text>
                      </Text>
                      <Text style={styles.bpAmt}>{formatUsdDollarsFixed2(amt)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {!isEmpty && nextBill ? (
              <View style={styles.billPreview}>
                <View style={styles.bpIco}>
                  <ServiceIcon
                    serviceName={
                      (typeof nextBill.subscription.serviceName === 'string' &&
                        nextBill.subscription.serviceName.trim()) ||
                      (typeof nextBill.subscription.serviceId === 'string' &&
                        nextBill.subscription.serviceId.trim()) ||
                      subscriptionDisplayLabel(nextBill.subscription)
                    }
                    serviceId={
                      typeof nextBill.subscription.serviceId === 'string' &&
                      nextBill.subscription.serviceId.trim()
                        ? nextBill.subscription.serviceId.trim()
                        : undefined
                    }
                    size={30}
                  />
                </View>
                <Text style={styles.bpName} numberOfLines={2}>
                  {subscriptionDisplayLabel(nextBill.subscription)}
                  <Text style={styles.bpBillingMeta}>
                    {' '}
                    · {formatBillingDetailLine(nextBill.date)}
                  </Text>
                </Text>
                <Text
                  style={[
                    styles.bpWhen,
                    nextBillWhen?.kind === 'today' && styles.bpWhenToday,
                    nextBillWhen?.kind === 'tomorrow' && styles.bpWhenTomorrow,
                    nextBillWhen?.kind === 'other' && styles.bpWhenUpcoming,
                  ]}
                >
                  {nextBillWhen?.label ?? ''}
                </Text>
                <Text style={styles.bpAmt}>
                  {formatUsdDollarsFixed2(getTotalCents(nextBill.subscription) / 100)}
                </Text>
              </View>
            ) : (
              <View style={styles.billPreview}>
                <View style={[styles.bpIco, { backgroundColor: '#EEEDFE' }]}>
                  <Ionicons name="calendar-outline" size={20} color={C.purple} />
                </View>
                <Text style={styles.bpNameEmpty} numberOfLines={2}>
                  {isEmpty
                    ? 'No upcoming bills · Add a subscription to get started'
                    : 'No upcoming bills scheduled'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.sh}>
            <Text style={styles.shTitle}>Friend balances</Text>
            <Text style={styles.shAction} onPress={() => router.push('/friends')}>See all</Text>
          </View>
          {friendBalances.length > 0 ? (
            <View style={styles.listCard}>
              {friendBalances.map((f, i) => {
                const av = getFriendAvatarColors(f.id);
                return (
                <Pressable
                  key={f.id}
                  style={[styles.friendRow, i === friendBalances.length - 1 && styles.rowLast]}
                  onPress={() => router.push('/friends')}
                >
                  <View style={[styles.friendAv, { backgroundColor: av.backgroundColor }]}>
                    <Text style={[styles.friendAvTxt, { color: av.color }]}>{f.initials}</Text>
                  </View>
                  <View style={styles.friendMid}>
                    <Text style={styles.fnName}>{f.name}</Text>
                    <Text style={styles.fnSub}>{f.subLine}</Text>
                  </View>
                  <View style={styles.friendBal}>
                    <Text style={[styles.fbAmt, { color: f.balanceColor }]}>{f.balanceLabel}</Text>
                    <Text style={styles.fbAction}>{f.actionLabel}</Text>
                  </View>
                </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable style={styles.emptyFriends}>
              <Ionicons name="people-outline" size={22} color={C.purple} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.emptyFriendsTitle}>No balances yet</Text>
                <Text style={styles.emptyFriendsSub}>Invite a friend to split with</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          )}

          <View style={styles.sh}>
            <Text style={styles.shTitle}>Upcoming splits</Text>
            <Text style={styles.shAction} onPress={() => router.push('/(tabs)/subscriptions')}>See all</Text>
          </View>
          {upcomingSplits.length > 0 ? (
            <View style={styles.listCard}>
              {upcomingSplits.map((item, i) => (
                <Pressable
                  key={item.id}
                  style={[styles.subRow, i === upcomingSplits.length - 1 && styles.rowLast]}
                  onPress={() => router.push(`/subscription/${item.id}`)}
                >
                  <View style={styles.subIco}>
                    <ServiceIcon
                      serviceName={item.serviceName}
                      serviceId={item.serviceId}
                      size={38}
                    />
                  </View>
                  <View style={styles.subMid}>
                    <Text style={styles.subName}>{item.name}</Text>
                    <Text style={styles.subMeta}>{item.meta}</Text>
                  </View>
                  <View style={styles.subRight}>
                    <Text style={styles.subAmt}>{formatUsdDollarsFixed2(item.total)}</Text>
                    <Text style={[styles.subStatus, { color: item.statusColor }]}>{item.status}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable style={styles.emptySplitCard} onPress={() => router.push('/add-subscription')}>
              <View style={styles.emptySplitIcon}>
                <Ionicons name="add-circle-outline" size={24} color={C.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.emptySplitTitle}>No upcoming splits</Text>
                <Text style={styles.emptySplitSub}>Tap Add sub to get started</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={C.purple} />
            </Pressable>
          )}

          <View style={styles.sh}>
            <Text style={styles.shTitle}>Recent activity</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/activity', params: { filter: 'all' } })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See all activity"
            >
              <Text style={styles.shAction}>See all</Text>
            </Pressable>
          </View>
          {recentActivity.length > 0 ? (
            <View style={styles.listCard}>
              {recentActivity.map((item, i) => (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push({
                      pathname: '/activity',
                      params: { filter: 'all', expandId: item.id },
                    })
                  }
                  style={[styles.actRow, i === recentActivity.length - 1 && styles.rowLast]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, open in Activity`}
                >
                  {item.viewerAvatarUrl ? (
                    <View style={styles.actAvatarWrap}>
                      <Image
                        source={{ uri: item.viewerAvatarUrl }}
                        style={styles.actAvatarImg}
                        accessibilityLabel="You"
                      />
                    </View>
                  ) : item.friendAvatar ? (
                    <View style={styles.actIcoWrap}>
                      <UserAvatarCircle
                        size={38}
                        initials={item.friendAvatar.initials}
                        imageUrl={item.friendAvatar.imageUrl}
                      />
                    </View>
                  ) : item.serviceMark ? (
                    <View style={styles.actIcoWrap}>
                      <ServiceIcon
                        serviceName={item.serviceMark}
                        serviceId={item.serviceId}
                        size={38}
                        listEndedMuted={item.serviceIconMuted}
                      />
                    </View>
                  ) : (
                    <View style={[styles.actIcoWrap, { backgroundColor: item.iconBg }]}>
                      <Ionicons
                        name={item.icon as React.ComponentProps<typeof Ionicons>['name']}
                        size={24}
                        color={item.iconColor}
                      />
                    </View>
                  )}
                  <View style={styles.actMid}>
                    <Text style={styles.actTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.actTime}>{item.timestamp}</Text>
                  </View>
                  <Text style={[styles.actAmt, { color: item.amountColor }]}>{item.amount}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityTxt}>No activity yet</Text>
            </View>
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
    paddingBottom: 36,
  },
  sbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  greetingWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    gap: 4,
  },
  greetingLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#fff',
    flexShrink: 0,
  },
  greetingName: {
    fontSize: 17,
    fontWeight: '500',
    color: '#fff',
    flexShrink: 1,
    minWidth: 0,
  },
  notifBadge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#4A1570',
  },
  notifBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  chartLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
  },
  heroDonutWrap: {
    width: HOME_DONUT_SIZE,
    flexShrink: 0,
    marginLeft: 8,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: '46%',
  },
  heroBadgeTxt: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 17,
    textAlign: 'right',
    flexShrink: 1,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  sh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  shTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  shAction: {
    fontSize: 14,
    fontWeight: '500',
    color: C.purple,
  },
  weekSectionHeader: {
    marginBottom: 12,
  },
  weekSectionTitle: {
    fontSize: 15,
    letterSpacing: 1.15,
  },
  weekSectionAction: {
    fontSize: 16,
  },
  quickActionsBelowFloat: {
    marginTop: 18,
    marginBottom: 4,
  },
  calStrip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  calDays: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 4,
  },
  calDay: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    minWidth: 42,
  },
  calDayToday: {
    backgroundColor: '#534AB7',
  },
  calDayBill: {
    backgroundColor: '#EEEDFE',
  },
  calDayName: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    lineHeight: 13,
  },
  calDayNameOn: { color: '#ffffff' },
  calDayNameBill: { color: C.purple },
  calDayNamePlain: { color: C.muted },
  calDayNum: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 21,
  },
  calDayNumOn: { color: '#ffffff' },
  calDayNumBill: { color: C.purple },
  calDayNumPlain: { color: C.text },
  calDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 8,
    flexWrap: 'wrap',
    maxWidth: 52,
  },
  calDotBrand: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  calDotPlaceholder: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  calDotMore: {
    fontSize: 8,
    color: C.muted,
    fontWeight: '600',
  },
  selectedDayDetail: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#F0EEE9',
    gap: 8,
  },
  billDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  billPreview: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#F0EEE9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bpIco: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bpName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    lineHeight: 19,
  },
  bpBillingMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  bpNameEmpty: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '500',
    color: C.muted,
    lineHeight: 20,
  },
  bpWhen: { fontSize: 13, fontWeight: '600', flexShrink: 0 },
  bpWhenToday: { color: C.red },
  bpWhenTomorrow: { color: C.orange },
  bpWhenUpcoming: { color: C.muted },
  bpAmt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    marginLeft: 'auto',
    flexShrink: 0,
    textAlign: 'right',
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rowDivider,
  },
  friendAv: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvTxt: { fontSize: 13, fontWeight: '600' },
  friendMid: { flex: 1 },
  fnName: { fontSize: 15, fontWeight: '500', color: C.text },
  fnSub: { fontSize: 13, color: C.muted, marginTop: 1 },
  friendBal: { alignItems: 'flex-end' },
  fbAmt: { fontSize: 16, fontWeight: '600' },
  fbAction: { fontSize: 12, color: C.muted, marginTop: 2 },
  emptyFriends: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  emptyFriendsTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  emptyFriendsSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rowDivider,
  },
  subIco: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subMid: { flex: 1 },
  subName: { fontSize: 15, fontWeight: '500', color: C.text },
  subMeta: { fontSize: 13, color: C.muted, marginTop: 1 },
  subRight: { alignItems: 'flex-end' },
  subAmt: { fontSize: 15, fontWeight: '500', color: C.text },
  subStatus: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  emptySplitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 12,
  },
  emptySplitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySplitTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  emptySplitSub: { fontSize: 13, color: C.muted, marginTop: 3 },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rowDivider,
  },
  actIcoWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: SERVICE_TILE_RADIUS,
    overflow: 'hidden',
    flexShrink: 0,
  },
  actAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: SERVICE_TILE_RADIUS,
  },
  actReminderTile: {
    backgroundColor: '#FAEEDA',
    borderRadius: SERVICE_TILE_RADIUS,
    overflow: 'hidden',
  },
  actMid: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  actTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },
  actTime: {
    fontSize: 10,
    color: C.muted,
    marginTop: 1,
    lineHeight: 13,
  },
  actAmt: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 0,
    textAlign: 'right',
    minWidth: 56,
  },
  emptyActivity: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  emptyActivityTxt: { fontSize: 14, color: C.muted, lineHeight: 21 },
});
