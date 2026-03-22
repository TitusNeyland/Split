import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { spacing } from '../../constants/theme';
import { getFriendAvatarColors } from '../../lib/friendAvatar';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { initialsFromName } from '../../lib/profile';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import { UserAvatarCircle } from '../components/UserAvatarCircle';
import {
  subscribeHomeFinancialPosition,
  type HomeFinancialPosition,
} from '../../lib/homeFinancialPositionFirestore';
import {
  formatMemberTenureMonths,
  subscribeHomeSavings,
  type HomeSavingsSnapshot,
} from '../../lib/homeSavingsFirestore';
import {
  buildCalendarStripDays,
  getHomeDemoBills,
  pickNextBillPreview,
} from '../../lib/homeWeekCalendar';
import { HomeDonutChart, HOME_DONUT_SIZE } from '../components/HomeDonutChart';
import { HomeHeroDonutLegend } from '../components/HomeHeroDonutLegend';
import { HomeSavingsPill } from '../components/HomeSavingsPill';
import { HomeQuickActionsRow } from '../components/HomeQuickActionsRow';
import {
  HomeReminderPickerModal,
  type ReminderPickCandidate,
} from '../components/HomeReminderPickerModal';
import { ServiceIcon } from '../components/ServiceIcon';

/** Toggle to `'empty'` to preview the new-user home (zeros + setup CTAs). */
const HOME_PREVIEW: 'filled' | 'empty' = 'filled';

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

function initialHomeFinancialPosition(): HomeFinancialPosition {
  if (HOME_PREVIEW === 'empty') {
    return { youOwe: 0, owedToYou: 0, overdue: 0, loading: false };
  }
  return { youOwe: 12, owedToYou: 47.5, overdue: 5.33, loading: false };
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

const friendBalancesFilled: FriendRow[] = [
  {
    id: 'sam',
    initials: 'SM',
    name: 'Sam M.',
    subLine: 'Netflix · 3 days overdue',
    balanceLabel: 'owes $5.33',
    balanceColor: C.red,
    actionLabel: 'send reminder',
  },
  {
    id: 'alex',
    initials: 'AL',
    name: 'Alex L.',
    subLine: 'Spotify · pending',
    balanceLabel: 'owes $3.40',
    balanceColor: C.orange,
    actionLabel: 'due in 7 days',
  },
  {
    id: 'casey',
    initials: 'CP',
    name: 'Casey P.',
    subLine: 'Dinner · split pending',
    balanceLabel: 'you owe $7.00',
    balanceColor: C.purple,
    actionLabel: 'settle up',
  },
  {
    id: 'taylor',
    initials: 'TR',
    name: 'Taylor R.',
    subLine: 'Xbox · paid up',
    balanceLabel: 'settled',
    balanceColor: C.green,
    actionLabel: 'all clear',
  },
];

type SplitRow = {
  id: string;
  name: string;
  meta: string;
  total: number;
  status: string;
  statusColor: string;
  serviceName: string;
};

const upcomingSplitsFilled: SplitRow[] = [
  {
    id: 'netflix',
    name: 'Netflix Premium',
    meta: '3 members · bills today',
    total: 22.99,
    status: 'you owe $12',
    statusColor: C.red,
    serviceName: 'Netflix Premium',
  },
  {
    id: 'spotify',
    name: 'Spotify Family',
    meta: '5 members · in 7 days',
    total: 16.99,
    status: 'owed $13.60',
    statusColor: C.green,
    serviceName: 'Spotify Family',
  },
];

type HomeRecentActivityItem = {
  id: string;
  kind: 'payment' | 'reminder';
  title: string;
  timestamp: string;
  amount: string;
  /** Received / paid → green; reminder / pending tone → amber. */
  amountColor: string;
  serviceMark?: string;
  /** Current user avatar for “You …” rows. */
  viewerAvatarUrl?: string | null;
};

const recentActivityFilled: HomeRecentActivityItem[] = [
  {
    id: '1',
    kind: 'payment',
    title: 'Alex paid Spotify',
    timestamp: '2 min ago',
    amount: '+$3.40',
    amountColor: C.green,
    serviceMark: 'Spotify',
  },
  {
    id: '2',
    kind: 'reminder',
    title: 'Reminder sent to Sam',
    timestamp: '1 hr ago',
    amount: '$5.33',
    amountColor: C.orange,
  },
  {
    id: '3',
    kind: 'payment',
    title: 'Taylor paid Xbox',
    timestamp: 'Yesterday',
    amount: '+$7.50',
    amountColor: C.green,
    serviceMark: 'Xbox',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { avatarUrl: homeAvatarUrl, displayName: homeDisplayName, profileLoading: homeProfileLoading } =
    useProfileAvatarUrl();
  const [user, setUser] = useState<User | null>(null);
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);
  const [position, setPosition] = useState<HomeFinancialPosition>(initialHomeFinancialPosition);
  const [savings, setSavings] = useState<HomeSavingsSnapshot>(() => ({
    lifetimeSaved: HOME_PREVIEW === 'empty' ? 0 : 318.4,
    joinedAt: null,
  }));
  const isEmpty = HOME_PREVIEW === 'empty';

  const notifCount = isEmpty ? 0 : 3;
  const setupStep = isEmpty ? 0 : 2;
  const setupTotal = 7;
  const setupPct = isEmpty ? 0 : (setupStep / setupTotal) * 100;

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      if (HOME_PREVIEW === 'filled') {
        setPosition({ youOwe: 12, owedToYou: 47.5, overdue: 5.33, loading: false });
      } else {
        setPosition({ youOwe: 0, owedToYou: 0, overdue: 0, loading: false });
      }
      return;
    }
    setPosition((prev) => ({ ...prev, loading: true }));
    return subscribeHomeFinancialPosition(uid, setPosition);
  }, [user?.uid]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      if (isEmpty) {
        setSavings({ lifetimeSaved: 0, joinedAt: null });
      } else {
        setSavings({ lifetimeSaved: 318.4, joinedAt: null });
      }
      return;
    }
    return subscribeHomeSavings(uid, user, setSavings);
  }, [user?.uid, user, isEmpty]);

  const savingsMonthsLabel = useMemo(() => {
    if (isEmpty) return '—';
    if (!user?.uid && HOME_PREVIEW === 'filled') return '6 months';
    return formatMemberTenureMonths(savings.joinedAt);
  }, [isEmpty, user?.uid, savings.joinedAt]);

  const homeCalendarBills = useMemo(() => getHomeDemoBills(isEmpty), [isEmpty]);

  const calendarDays = useMemo(
    () => buildCalendarStripDays(new Date(), homeCalendarBills, 21),
    [homeCalendarBills]
  );

  const billPreview = useMemo(
    () => pickNextBillPreview(homeCalendarBills, new Date()),
    [homeCalendarBills]
  );

  const upcomingSplits = isEmpty ? [] : upcomingSplitsFilled;
  const friendBalances = isEmpty ? [] : friendBalancesFilled;
  const recentActivity = useMemo((): HomeRecentActivityItem[] => {
    if (isEmpty) return [];
    const base = recentActivityFilled.slice(0, 3);
    if (!isFirebaseConfigured() || !homeAvatarUrl) return base;
    const youRow: HomeRecentActivityItem = {
      id: 'you-netflix',
      kind: 'payment',
      title: 'You paid Netflix',
      timestamp: 'Just now',
      amount: '$12.00',
      amountColor: C.red,
      viewerAvatarUrl: homeAvatarUrl,
    };
    return [youRow, ...base.slice(0, 2)];
  }, [isEmpty, homeAvatarUrl]);

  const greetingName = useMemo(() => {
    if (isEmpty) return 'there';
    if (isFirebaseConfigured() && homeDisplayName) {
      const first = homeDisplayName.split(/\s+/)[0];
      return first && first.length > 0 ? first : 'there';
    }
    return 'Titus';
  }, [isEmpty, homeDisplayName]);

  const homeHeaderInitials = useMemo(() => {
    const n = homeDisplayName ?? user?.displayName ?? 'Me';
    return initialsFromName(n);
  }, [homeDisplayName, user?.displayName]);

  const heroLegendCopy = useMemo(() => {
    if (isEmpty) {
      return {
        youOweSub: 'Add a subscription to track',
        owedSub: 'Invite friends to split',
        overdueSub: 'No overdue balances',
      };
    }
    return {
      youOweSub: position.youOwe > 0 ? 'Netflix · due in 2 days' : 'Nothing due right now',
      owedSub: position.owedToYou > 0 ? 'Spotify, Xbox, iCloud' : 'No incoming payments yet',
      overdueSub: position.overdue > 0 ? 'Sam · 3 days overdue' : 'All caught up',
    };
  }, [isEmpty, position.youOwe, position.owedToYou, position.overdue]);

  const reminderCandidates = useMemo((): ReminderPickCandidate[] => {
    if (isEmpty) return [];
    return [
      { id: 'sam', name: 'Sam M.', detail: 'Netflix · 3 days overdue', overdue: true },
      { id: 'alex', name: 'Alex L.', detail: 'Spotify · pending', overdue: false },
    ];
  }, [isEmpty]);

  const onInviteFriend = useCallback(async () => {
    try {
      await Share.share({
        message:
          'Split bills and subscriptions with me on Split — download the app to connect and share costs.',
      });
    } catch {
      /* dismissed */
    }
  }, []);

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
            <Text style={styles.greeting} numberOfLines={1}>
              {`Good morning, ${greetingName}`}
            </Text>
            <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Notifications">
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
              youOweSub={heroLegendCopy.youOweSub}
              owedSub={heroLegendCopy.owedSub}
              overdueSub={heroLegendCopy.overdueSub}
            />
          </View>
          <HomeSavingsPill
            savedDollars={isEmpty ? 0 : savings.lifetimeSaved}
            monthsLabel={savingsMonthsLabel}
          />
          {isEmpty ? (
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeTxt}>Add friends & subs{'\n'}to see balances</Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {/* Float card */}
        <View style={styles.floatCard}>
          <Pressable style={styles.fcRow}>
            <View style={[styles.fcIcon, { backgroundColor: '#FCEBEB' }]}>
              <Ionicons name="layers-outline" size={18} color={C.red} />
            </View>
            <View style={styles.fcMid}>
              <Text style={styles.fcTitle}>You owe</Text>
              <Text style={styles.fcSub}>
                {isEmpty ? 'Nothing due yet' : 'Netflix · due in 2 days'}
              </Text>
            </View>
            <View style={styles.fcRight}>
              <Text style={[styles.fcAmt, { color: C.red }]}>
                {isEmpty ? '$0.00' : '$12.00'}
              </Text>
              <Text style={styles.fcDetail}>{isEmpty ? 'add a bill' : 'tap to pay'}</Text>
            </View>
          </Pressable>
          <Pressable style={styles.fcRow}>
            <View style={[styles.fcIcon, { backgroundColor: '#E1F5EE' }]}>
              <Ionicons name="checkmark" size={18} color={C.green} />
            </View>
            <View style={styles.fcMid}>
              <Text style={styles.fcTitle}>
                {isEmpty ? 'Pending' : 'Pending from 3 people'}
              </Text>
              <Text style={styles.fcSub}>
                {isEmpty ? 'Invite friends to split' : 'Spotify, Xbox, iCloud'}
              </Text>
            </View>
            <View style={styles.fcRight}>
              <Text style={[styles.fcAmt, { color: C.green }]}>
                {isEmpty ? '$0.00' : '$47.50'}
              </Text>
              <Text style={styles.fcDetail}>{isEmpty ? 'get started' : 'view all'}</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.fcRow, styles.fcRowLast]}>
            <View style={[styles.fcIcon, { backgroundColor: '#FAEEDA' }]}>
              <Ionicons name="time-outline" size={18} color="#854F0B" />
            </View>
            <View style={styles.fcMid}>
              <Text style={styles.fcTitle}>
                {isEmpty ? 'Overdue' : 'Sam overdue'}
              </Text>
              <Text style={styles.fcSub}>
                {isEmpty ? 'No late balances yet' : 'Netflix · 3 days late'}
              </Text>
            </View>
            <View style={styles.fcRight}>
              <Text style={[styles.fcAmt, { color: C.orange }]}>
                {isEmpty ? '$0.00' : '$5.33'}
              </Text>
              <Text style={styles.fcDetail}>{isEmpty ? 'all clear' : 'send reminder'}</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.quickActionsBelowFloat}>
          <HomeQuickActionsRow actions={homeQuickActions} />
        </View>

        <HomeReminderPickerModal
          visible={reminderPickerOpen}
          onClose={() => setReminderPickerOpen(false)}
          candidates={reminderCandidates}
          onSelect={onReminderPick}
        />

        <View style={styles.body}>
          <View style={[styles.sh, styles.weekSectionHeader]}>
            <Text style={[styles.shTitle, styles.weekSectionTitle]}>This week</Text>
            <Pressable
              onPress={() => router.push('/subscriptions?calendar=1')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open full billing calendar on Subscriptions"
            >
              <Text style={[styles.shAction, styles.weekSectionAction]}>Full calendar</Text>
            </Pressable>
          </View>
          <View style={styles.calStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calDays}>
              {calendarDays.map((d) => (
                <Pressable
                  key={d.key}
                  style={[
                    styles.calDay,
                    d.isToday && styles.calDayToday,
                    !d.isToday && d.hasBill && styles.calDayBill,
                  ]}
                >
                  <Text
                    style={[
                      styles.calDayName,
                      d.isToday && styles.calDayNameOn,
                      !d.isToday && d.hasBill && styles.calDayNameBill,
                      !d.isToday && !d.hasBill && styles.calDayNamePlain,
                    ]}
                  >
                    {d.dow}
                  </Text>
                  <Text
                    style={[
                      styles.calDayNum,
                      d.isToday && styles.calDayNumOn,
                      !d.isToday && d.hasBill && styles.calDayNumBill,
                      !d.isToday && !d.hasBill && styles.calDayNumPlain,
                    ]}
                  >
                    {d.num}
                  </Text>
                  <View
                    style={[
                      styles.calDot,
                      d.isToday && styles.calDotToday,
                      !d.isToday && d.hasBill && styles.calDotBill,
                      !d.isToday && !d.hasBill && styles.calDotPlain,
                    ]}
                  />
                </Pressable>
              ))}
            </ScrollView>
            {!isEmpty && billPreview ? (
              <View style={styles.billPreview}>
                <View style={styles.bpIco}>
                  <ServiceIcon serviceName={billPreview.serviceName} size={30} />
                </View>
                <Text style={styles.bpName} numberOfLines={2}>
                  {billPreview.serviceName}
                  <Text style={styles.bpBillingMeta}> · {billPreview.billingDetail}</Text>
                </Text>
                <Text
                  style={[styles.bpWhen, billPreview.whenIsToday ? styles.bpWhenToday : styles.bpWhenUpcoming]}
                >
                  {billPreview.whenLabel}
                </Text>
                <Text style={styles.bpAmt}>{billPreview.amountFormatted}</Text>
              </View>
            ) : (
              <View style={styles.billPreview}>
                <View style={[styles.bpIco, { backgroundColor: '#EEEDFE' }]}>
                  <Ionicons name="calendar-outline" size={20} color={C.purple} />
                </View>
                <Text style={styles.bpNameEmpty} numberOfLines={2}>
                  {isEmpty
                    ? 'No bills scheduled this week'
                    : 'No upcoming bills in the next 14 days'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.sh}>
            <Text style={styles.shTitle}>Friend balances</Text>
            <Text style={styles.shAction}>See all</Text>
          </View>
          {friendBalances.length > 0 ? (
            <View style={styles.listCard}>
              {friendBalances.map((f, i) => {
                const av = getFriendAvatarColors(f.id);
                return (
                <Pressable
                  key={f.id}
                  style={[styles.friendRow, i === friendBalances.length - 1 && styles.rowLast]}
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
                <Text style={styles.emptyFriendsTitle}>No friend balances yet</Text>
                <Text style={styles.emptyFriendsSub}>Invite someone to split a subscription</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          )}

          <View style={styles.sh}>
            <Text style={styles.shTitle}>Upcoming splits</Text>
            <Text style={styles.shAction}>See all</Text>
          </View>
          {upcomingSplits.length > 0 ? (
            <View style={styles.listCard}>
              {upcomingSplits.map((item, i) => (
                <Pressable
                  key={item.id}
                  style={[styles.subRow, i === upcomingSplits.length - 1 && styles.rowLast]}
                >
                  <View style={styles.subIco}>
                    <ServiceIcon serviceName={item.serviceName} size={36} />
                  </View>
                  <View style={styles.subMid}>
                    <Text style={styles.subName}>{item.name}</Text>
                    <Text style={styles.subMeta}>{item.meta}</Text>
                  </View>
                  <View style={styles.subRight}>
                    <Text style={styles.subAmt}>{`$${item.total.toFixed(2)}`}</Text>
                    <Text style={[styles.subStatus, { color: item.statusColor }]}>{item.status}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable style={styles.emptySplitCard}>
              <View style={styles.emptySplitIcon}>
                <Ionicons name="add-circle-outline" size={24} color={C.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.emptySplitTitle}>Add your first subscription</Text>
                <Text style={styles.emptySplitSub}>Track shared bills and who owes what</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={C.purple} />
            </Pressable>
          )}

          <View style={styles.sh}>
            <Text style={styles.shTitle}>Recent activity</Text>
            <Pressable
              onPress={() => router.push('/activity')}
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
                <View
                  key={item.id}
                  style={[styles.actRow, i === recentActivity.length - 1 && styles.rowLast]}
                >
                  {item.viewerAvatarUrl ? (
                    <View style={styles.actAvatarWrap}>
                      <Image
                        source={{ uri: item.viewerAvatarUrl }}
                        style={styles.actAvatarImg}
                        accessibilityLabel="You"
                      />
                    </View>
                  ) : item.kind === 'payment' && item.serviceMark ? (
                    <View style={styles.actIcoWrap}>
                      <ServiceIcon serviceName={item.serviceMark} size={26} />
                    </View>
                  ) : (
                    <View style={[styles.actIcoWrap, styles.actReminderCircle]}>
                      <Ionicons name="notifications-outline" size={24} color="#854F0B" />
                    </View>
                  )}
                  <View style={styles.actMid}>
                    <Text style={styles.actTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.actTime}>{item.timestamp}</Text>
                  </View>
                  <Text style={[styles.actAmt, { color: item.amountColor }]}>{item.amount}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityTxt}>No activity yet — payments and reminders show up here.</Text>
            </View>
          )}

          <View style={styles.setupWrap}>
            <View style={styles.setupTop}>
              <Text style={styles.setupLbl}>
                Complete setup ({setupStep}/{setupTotal})
              </Text>
              <Text style={styles.setupAction}>Continue →</Text>
            </View>
            <View style={styles.setupTrack}>
              <View style={[styles.setupFill, { width: `${setupPct}%` }]} />
            </View>
          </View>
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
  greeting: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '500',
    color: '#fff',
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
  floatCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    marginHorizontal: 14,
    marginTop: -22,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  fcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  fcRowLast: {
    borderBottomWidth: 0,
  },
  fcIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcMid: { flex: 1 },
  fcTitle: { fontSize: 16, fontWeight: '500', color: C.text },
  fcSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  fcRight: { alignItems: 'flex-end' },
  fcAmt: { fontSize: 17, fontWeight: '500' },
  fcDetail: { fontSize: 13, color: C.muted, marginTop: 2 },
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
    marginTop: 12,
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
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  calDotToday: { backgroundColor: '#ffffff' },
  calDotBill: { backgroundColor: C.purple },
  calDotPlain: { backgroundColor: 'transparent' },
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
    width: 36,
    height: 36,
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
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rowDivider,
  },
  actIcoWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    flexShrink: 0,
  },
  actAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  actReminderCircle: {
    backgroundColor: '#FAEEDA',
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
    fontSize: 13,
    color: C.muted,
    marginTop: 1,
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
  setupWrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  setupTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  setupLbl: { fontSize: 14, fontWeight: '500', color: C.text },
  setupAction: { fontSize: 14, fontWeight: '500', color: C.purple },
  setupTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: C.divider,
    overflow: 'hidden',
  },
  setupFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: C.purple,
  },
});
