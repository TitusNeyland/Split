import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { spacing } from '../../constants/theme';
import { getFriendAvatarColors } from '../../lib/friendAvatar';
import { getFirebaseAuth } from '../../lib/firebase';
import {
  subscribeHomeFinancialPosition,
  type HomeFinancialPosition,
} from '../../lib/homeFinancialPositionFirestore';
import { HomeDonutChart, HOME_DONUT_SIZE } from '../components/HomeDonutChart';
import { HomeHeroDonutLegend } from '../components/HomeHeroDonutLegend';
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

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function initialHomeFinancialPosition(): HomeFinancialPosition {
  if (HOME_PREVIEW === 'empty') {
    return { youOwe: 0, owedToYou: 0, overdue: 0, loading: false };
  }
  return { youOwe: 12, owedToYou: 47.5, overdue: 5.33, loading: false };
}

const quickActions = [
  { id: 'scan', label: 'Scan receipt', icon: 'phone-portrait-outline' as const, bg: '#EEEDFE', color: C.purple },
  { id: 'add', label: 'Add sub', icon: 'time-outline' as const, bg: '#E1F5EE', color: '#0F6E56' },
  { id: 'invite', label: 'Invite friend', icon: 'people-outline' as const, bg: '#FAEEDA', color: '#854F0B' },
  { id: 'remind', label: 'Send reminder', icon: 'notifications-outline' as const, bg: '#FAECE7', color: '#993C1D' },
  { id: 'paid', label: 'Mark paid', icon: 'checkmark-circle-outline' as const, bg: '#EAF3DE', color: '#3B6D11' },
];

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
  title: string;
  amount: string;
  amountColor: string;
  serviceMark?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconBg?: string;
  iconColor?: string;
};

const recentActivityFilled: HomeRecentActivityItem[] = [
  {
    id: '1',
    title: 'Alex paid Spotify',
    amount: '+$3.40',
    amountColor: C.green,
    serviceMark: 'Spotify',
  },
  {
    id: '2',
    title: 'Reminder sent to Sam',
    amount: '$5.33',
    amountColor: C.orange,
    iconBg: '#FAEEDA',
    icon: 'notifications',
    iconColor: '#854F0B',
  },
  {
    id: '3',
    title: 'Taylor paid Xbox',
    amount: '+$7.50',
    amountColor: C.green,
    serviceMark: 'Xbox',
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [position, setPosition] = useState<HomeFinancialPosition>(initialHomeFinancialPosition);
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

  const calendarDays = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const dow = start.getDay();
    const fromMon = dow === 0 ? -6 : 1 - dow;
    start.setDate(start.getDate() + fromMon);
    start.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const billKeys = new Set<string>();
    if (!isEmpty) {
      billKeys.add(dateKey(today));
      const d2 = new Date(today);
      d2.setDate(d2.getDate() + 5);
      billKeys.add(dateKey(d2));
      const d3 = new Date(today);
      d3.setDate(d3.getDate() + 7);
      billKeys.add(dateKey(d3));
    }

    const days: { key: string; dow: string; num: number; isToday: boolean; hasBill: boolean }[] = [];
    for (let i = 0; i < 10; i++) {
      const cell = new Date(start);
      cell.setDate(start.getDate() + i);
      const isToday = cell.getTime() === today.getTime();
      days.push({
        key: dateKey(cell),
        dow: cell.toLocaleDateString('en-US', { weekday: 'short' }),
        num: cell.getDate(),
        isToday,
        hasBill: billKeys.has(dateKey(cell)),
      });
    }
    return days;
  }, [isEmpty]);

  const billPreview = {
    serviceName: 'Netflix',
    name: 'Netflix',
    detail: 'billing Mar 18',
    whenLabel: 'Today',
    amount: '$22.99',
  };

  const upcomingSplits = isEmpty ? [] : upcomingSplitsFilled;
  const friendBalances = isEmpty ? [] : friendBalancesFilled;
  const recentActivity = isEmpty ? [] : recentActivityFilled;

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
            <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Profile">
              <Ionicons name="person-outline" size={22} color="rgba(255,255,255,0.65)" />
            </Pressable>
            <Text style={styles.greeting} numberOfLines={1}>
              Good morning, Titus
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

        <View style={styles.body}>
          <View style={styles.sh}>
            <Text style={styles.shTitle}>Quick actions</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.qaScroll}
          >
            {quickActions.map((q) => (
              <Pressable key={q.id} style={styles.qaBtn}>
                <View style={[styles.qaIcon, { backgroundColor: q.bg }]}>
                  <Ionicons name={q.icon} size={20} color={q.color} />
                </View>
                <Text style={styles.qaLabel}>{q.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.sh}>
            <Text style={styles.shTitle}>This week</Text>
            <Text style={styles.shAction}>Full calendar</Text>
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
                    ]}
                  >
                    {d.dow}
                  </Text>
                  <Text
                    style={[
                      styles.calDayNum,
                      d.isToday && styles.calDayNumOn,
                      !d.isToday && d.hasBill && styles.calDayNumBill,
                    ]}
                  >
                    {d.num}
                  </Text>
                  <View
                    style={[
                      styles.calDot,
                      d.isToday && styles.calDotToday,
                      !d.isToday && d.hasBill && styles.calDotBill,
                      !d.isToday && !d.hasBill && styles.calDotHidden,
                    ]}
                  />
                </Pressable>
              ))}
            </ScrollView>
            {!isEmpty ? (
              <View style={styles.billPreview}>
                <View style={styles.bpIco}>
                  <ServiceIcon serviceName={billPreview.serviceName} size={26} />
                </View>
                <Text style={styles.bpName} numberOfLines={1}>
                  {billPreview.name} · {billPreview.detail}
                </Text>
                <Text style={styles.bpWhen}>{billPreview.whenLabel}</Text>
                <Text style={styles.bpAmt}>{billPreview.amount}</Text>
              </View>
            ) : (
              <View style={styles.billPreview}>
                <View style={[styles.bpIco, { backgroundColor: '#EEEDFE' }]}>
                  <Ionicons name="calendar-outline" size={16} color={C.purple} />
                </View>
                <Text style={styles.bpNameEmpty}>No bills scheduled this week</Text>
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
            <Text style={styles.shAction}>See all</Text>
          </View>
          {recentActivity.length > 0 ? (
            <View style={styles.listCard}>
              {recentActivity.map((item, i) => (
                <View
                  key={item.id}
                  style={[styles.actRow, i === recentActivity.length - 1 && styles.rowLast]}
                >
                  {item.serviceMark ? (
                    <View style={styles.actIco}>
                      <ServiceIcon serviceName={item.serviceMark} size={30} />
                    </View>
                  ) : item.icon ? (
                    <View style={[styles.actIco, { backgroundColor: item.iconBg ?? '#F0EEE9' }]}>
                      <Ionicons name={item.icon} size={14} color={item.iconColor ?? C.muted} />
                    </View>
                  ) : null}
                  <Text style={styles.actTxt}>{item.title}</Text>
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
  qaScroll: {
    flexDirection: 'row',
    gap: 9,
    paddingBottom: 2,
  },
  qaBtn: {
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 72,
  },
  qaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.text,
    textAlign: 'center',
  },
  calStrip: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  calDays: {
    flexDirection: 'row',
    gap: 5,
  },
  calDay: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    minWidth: 40,
  },
  calDayToday: {
    backgroundColor: C.purple,
  },
  calDayBill: {
    backgroundColor: '#EEEDFE',
  },
  calDayName: {
    fontSize: 11,
    fontWeight: '500',
    color: C.muted,
    textTransform: 'uppercase',
  },
  calDayNameOn: { color: 'rgba(255,255,255,0.75)' },
  calDayNameBill: { color: C.purple },
  calDayNum: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
  },
  calDayNumOn: { color: '#fff' },
  calDayNumBill: { color: C.purple },
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  calDotToday: { backgroundColor: 'rgba(255,255,255,0.75)' },
  calDotBill: { backgroundColor: C.purple },
  calDotHidden: { backgroundColor: 'transparent' },
  billPreview: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bpIco: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpName: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
  bpNameEmpty: { flex: 1, fontSize: 14, fontWeight: '500', color: C.muted },
  bpWhen: { fontSize: 13, color: C.red, fontWeight: '500' },
  bpAmt: { fontSize: 14, fontWeight: '600', color: C.red, marginLeft: 4 },
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
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rowDivider,
  },
  actIco: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actTxt: { flex: 1, fontSize: 14, color: C.muted },
  actAmt: { fontSize: 14, fontWeight: '500' },
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
