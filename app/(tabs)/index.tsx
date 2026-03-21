import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { spacing } from '../../constants/theme';
import { getFriendAvatarColors } from '../../lib/friendAvatar';

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

const SPARKLINE_DATA = [18, 22, 19, 28, 24, 20, 26, 30, 25, 22, 28, 32, 26, 30, 35, 47];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function Sparkline({
  width,
  height = 72,
  data,
}: {
  width: number;
  height?: number;
  data: number[];
}) {
  const minY = 10;
  const maxY = 60;
  const padT = 6;
  const padB = 10;
  const n = data.length;
  if (width <= 0 || n < 2) return <View style={{ height }} />;

  const xAt = (i: number) => (i / (n - 1)) * width;
  const yAt = (v: number) =>
    padT + (1 - (v - minY) / (maxY - minY)) * (height - padT - padB);

  let lineD = '';
  data.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    lineD += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const yBottom = height;
  const fillD = `${lineD} L ${xAt(n - 1)} ${yBottom} L ${xAt(0)} ${yBottom} Z`;
  const lx = xAt(n - 1);
  const ly = yAt(data[n - 1]!);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.14} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.02} />
        </SvgLinearGradient>
      </Defs>
      <Path d={fillD} fill="url(#sparkFill)" />
      <Path d={lineD} fill="none" stroke="#ffffff" strokeWidth={2} />
      <Circle
        cx={lx}
        cy={ly}
        r={6}
        fill="#ffffff"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={3}
      />
    </Svg>
  );
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
  iconBg: string;
  iconEmoji: string;
};

const upcomingSplitsFilled: SplitRow[] = [
  {
    id: 'netflix',
    name: 'Netflix Premium',
    meta: '3 members · bills today',
    total: 22.99,
    status: 'you owe $12',
    statusColor: C.red,
    iconBg: '#E1F5EE',
    iconEmoji: '📺',
  },
  {
    id: 'spotify',
    name: 'Spotify Family',
    meta: '5 members · in 7 days',
    total: 16.99,
    status: 'owed $13.60',
    statusColor: C.green,
    iconBg: '#EEEDFE',
    iconEmoji: '🎵',
  },
];

const recentActivityFilled = [
  {
    id: '1',
    title: 'Alex paid Spotify',
    amount: '+$3.40',
    amountColor: C.green,
    iconBg: '#E1F5EE',
    icon: 'checkmark' as const,
    iconColor: C.green,
  },
  {
    id: '2',
    title: 'Reminder sent to Sam',
    amount: '$5.33',
    amountColor: C.orange,
    iconBg: '#FAEEDA',
    icon: 'notifications' as const,
    iconColor: '#854F0B',
  },
  {
    id: '3',
    title: 'Taylor paid Xbox',
    amount: '+$7.50',
    amountColor: C.green,
    iconBg: '#E1F5EE',
    icon: 'checkmark' as const,
    iconColor: C.green,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(120, windowWidth - 40);
  const isEmpty = HOME_PREVIEW === 'empty';

  const owedThisMonth = isEmpty ? 0 : 47.5;
  const notifCount = isEmpty ? 0 : 3;
  const setupStep = isEmpty ? 0 : 2;
  const setupTotal = 7;
  const setupPct = isEmpty ? 0 : (setupStep / setupTotal) * 100;

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
    emoji: '📺',
    name: 'Netflix',
    detail: 'billing Mar 18',
    whenLabel: 'Today',
    amount: '$22.99',
  };

  const upcomingSplits = isEmpty ? [] : upcomingSplitsFilled;
  const friendBalances = isEmpty ? [] : friendBalancesFilled;
  const recentActivity = isEmpty ? [] : recentActivityFilled;

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
              Good morning, Jordan
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

          <View style={styles.heroHeader}>
            <View style={styles.heroAmountCol}>
              <Text style={styles.heroLabel}>You&apos;re owed this month</Text>
              <Text style={styles.heroAmount}>
                {isEmpty ? '$0.00' : `$${owedThisMonth.toFixed(2)}`}
              </Text>
            </View>
            {!isEmpty ? (
              <View style={styles.heroBadge}>
                <Ionicons name="checkmark" size={14} color="#4ade80" />
                <Text style={styles.heroBadgeTxt}>
                  $12 more{'\n'}than last month
                </Text>
              </View>
            ) : (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeTxt}>Add friends & subs{'\n'}to see balances</Text>
              </View>
            )}
          </View>

          <View style={styles.chartWrap}>
            {!isEmpty ? <Sparkline width={chartWidth} height={72} data={SPARKLINE_DATA} /> : null}
          </View>
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
            <View style={[styles.fcIcon, { backgroundColor: '#EEEDFE' }]}>
              <Ionicons name="phone-portrait-outline" size={18} color={C.purple} />
            </View>
            <View style={styles.fcMid}>
              <Text style={styles.fcTitle}>Scan a receipt</Text>
              <Text style={styles.fcSub}>Split your last dinner</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
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
                <View style={[styles.bpIco, { backgroundColor: '#E1F5EE' }]}>
                  <Text style={styles.bpEmoji}>{billPreview.emoji}</Text>
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
                  <View style={[styles.subIco, { backgroundColor: item.iconBg }]}>
                    <Text style={styles.subEmoji}>{item.iconEmoji}</Text>
                  </View>
                  <View style={styles.subMid}>
                    <Text style={styles.subName}>{item.name}</Text>
                    <Text style={styles.subMeta}>{item.meta}</Text>
                  </View>
                  <View style={styles.subRight}>
                    <Text style={styles.subAmt}>${item.total.toFixed(2)}</Text>
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
                  <View style={[styles.actIco, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon} size={14} color={item.iconColor} />
                  </View>
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
    marginBottom: 16,
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
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroAmountCol: {
    flexShrink: 1,
  },
  heroLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 5,
  },
  heroAmount: {
    fontSize: 44,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 48,
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
  chartWrap: {
    height: 72,
    marginTop: 8,
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
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpEmoji: { fontSize: 14 },
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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subEmoji: { fontSize: 18 },
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
