import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import { SUBSCRIPTIONS_DEMO_MODE } from '../../lib/subscription/subscriptionsScreenDemo';
import { getBillingCalendarDemoSubscriptions } from '../../lib/subscription/billingCalendarDemo';
import { subscribeBillingCalendarSubscriptions } from '../../lib/subscription/billingCalendarFirestore';
import {
  billsForMonth,
  buildCalendarGrid,
  computeMonthSummaryDetailed,
  formatSummaryMoney,
  subscriptionsByDayKey,
  type BillingCalendarSubscription,
  weekdayLabelsShort,
} from '../../lib/subscription/billingCalendarModel';
import { ServiceIcon } from '../components/shared/ServiceIcon';
import { spacing } from '../../constants/theme';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  green: '#1D9E75',
  orange: '#EF9F27',
  lavender: '#EEEDFE',
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function formatDayDetailHeader(d: Date): string {
  const wk = d.toLocaleDateString(undefined, { weekday: 'long' });
  const rest = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Billing on ${wk}, ${rest}`;
}

export default function BillingCalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const today = new Date();
  const [user, setUser] = useState<User | null>(null);
  const [subs, setSubs] = useState<BillingCalendarSubscription[]>([]);

  const [cursorYear, setCursorYear] = useState(() => today.getFullYear());
  const [cursorMonthIndex, setCursorMonthIndex] = useState(() => today.getMonth());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
      setSubs(getBillingCalendarDemoSubscriptions());
      return;
    }
    const uid = user?.uid;
    if (!uid) {
      setSubs([]);
      return;
    }
    return subscribeBillingCalendarSubscriptions(uid, setSubs);
  }, [user?.uid]);

  useEffect(() => {
    if (selectedKey == null) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    });
    return () => handle.cancel();
  }, [selectedKey]);

  const instances = useMemo(
    () => billsForMonth(subs, cursorYear, cursorMonthIndex),
    [subs, cursorYear, cursorMonthIndex]
  );

  const prevYm = useMemo(() => {
    if (cursorMonthIndex === 0) return { y: cursorYear - 1, m: 11 };
    return { y: cursorYear, m: cursorMonthIndex - 1 };
  }, [cursorYear, cursorMonthIndex]);

  const nextYm = useMemo(() => {
    if (cursorMonthIndex === 11) return { y: cursorYear + 1, m: 0 };
    return { y: cursorYear, m: cursorMonthIndex + 1 };
  }, [cursorYear, cursorMonthIndex]);

  const gridInstances = useMemo(() => {
    return [
      ...billsForMonth(subs, prevYm.y, prevYm.m),
      ...billsForMonth(subs, cursorYear, cursorMonthIndex),
      ...billsForMonth(subs, nextYm.y, nextYm.m),
    ];
  }, [subs, prevYm, nextYm, cursorYear, cursorMonthIndex]);

  const byDay = useMemo(() => subscriptionsByDayKey(gridInstances), [gridInstances]);

  const summary = useMemo(
    () => computeMonthSummaryDetailed(instances, today),
    [instances, today]
  );

  const grid = useMemo(
    () => buildCalendarGrid(cursorYear, cursorMonthIndex, today, byDay),
    [cursorYear, cursorMonthIndex, today, byDay]
  );

  const dowLabels = useMemo(() => weekdayLabelsShort(), []);

  const monthTitle = useMemo(
    () =>
      new Date(cursorYear, cursorMonthIndex, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [cursorYear, cursorMonthIndex]
  );

  const goPrevMonth = useCallback(() => {
    setSelectedKey(null);
    if (cursorMonthIndex === 0) {
      setCursorYear((y) => y - 1);
      setCursorMonthIndex(11);
    } else {
      setCursorMonthIndex((m) => m - 1);
    }
  }, [cursorMonthIndex]);

  const goNextMonth = useCallback(() => {
    setSelectedKey(null);
    if (cursorMonthIndex === 11) {
      setCursorYear((y) => y + 1);
      setCursorMonthIndex(0);
    } else {
      setCursorMonthIndex((m) => m + 1);
    }
  }, [cursorMonthIndex]);

  const goToday = useCallback(() => {
    setCursorYear(today.getFullYear());
    setCursorMonthIndex(today.getMonth());
    setSelectedKey(dateKey(today));
  }, [today]);

  const selectedSubs = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  const calCardW = Math.min(420, width - 20);

  const calendarWeeks = useMemo(() => {
    const w: (typeof grid)[] = [];
    for (let i = 0; i < grid.length; i += 7) {
      w.push(grid.slice(i, i + 7));
    }
    return w;
  }, [grid]);

  const selectedDate =
    selectedKey != null
      ? new Date(
          parseInt(selectedKey.split('-')[0]!, 10),
          parseInt(selectedKey.split('-')[1]!, 10) - 1,
          parseInt(selectedKey.split('-')[2]!, 10)
        )
      : null;

  const openSubscription = useCallback(
    (id: string) => {
      router.push(`/subscription/${id}`);
    },
    [router]
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xl }]}
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
          <Pressable
            onPress={() => router.back()}
            style={styles.backRow}
            accessibilityRole="button"
            accessibilityLabel="Go back to Subscriptions"
          >
            <Ionicons name="chevron-back" size={26} color="rgba(255,255,255,0.65)" />
            <Text style={styles.backLbl}>Subscriptions</Text>
          </Pressable>
          <View style={styles.titleRow}>
            <Text style={styles.heroTitle}>Billing Calendar</Text>
            <Pressable
              onPress={goToday}
              style={styles.todayBtn}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <Text style={styles.todayBtnTxt}>Today</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.monthSummary}>
          <View style={styles.msCell}>
            <Text style={styles.msVal}>{formatSummaryMoney(summary.totalBillingCents)}</Text>
            <Text style={styles.msLbl}>Total this month</Text>
          </View>
          <View style={styles.msCell}>
            <Text style={[styles.msVal, styles.msValPurple]}>{formatSummaryMoney(summary.yourShareCents)}</Text>
            <Text style={styles.msLbl}>Your share</Text>
          </View>
          <View style={styles.msCell}>
            <Text style={[styles.msVal, styles.msValGreen]}>{formatSummaryMoney(summary.paidSoFarCents)}</Text>
            <Text style={styles.msLbl}>Paid so far</Text>
          </View>
          <View style={styles.msCell}>
            <Text style={[styles.msVal, styles.msValOrange]}>{formatSummaryMoney(summary.upcomingCents)}</Text>
            <Text style={styles.msLbl}>Upcoming</Text>
          </View>
        </View>

        <View style={[styles.calCard, { width: calCardW }]}>
          <View style={styles.calHeader}>
            <Pressable
              onPress={goPrevMonth}
              style={styles.calNavBtn}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color="#5F5E5A" />
            </Pressable>
            <Text style={styles.calMonth}>{monthTitle}</Text>
            <Pressable
              onPress={goNextMonth}
              style={styles.calNavBtn}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color="#5F5E5A" />
            </Pressable>
          </View>
          <View style={styles.calGrid}>
            <View style={styles.calDow}>
              {dowLabels.map((l, i) => (
                <Text key={`${l}-${i}`} style={styles.calDowCell}>
                  {l}
                </Text>
              ))}
            </View>
            <View style={styles.calDays}>
              {calendarWeeks.map((week, wi) => (
                <View key={`week-${wi}`} style={styles.calWeekRow}>
                  {week.map((cell) => {
                    const k = dateKey(cell.date);
                    const selected = selectedKey === k;
                    return (
                      <Pressable
                        key={cell.key}
                        onPress={() => setSelectedKey(k)}
                        style={[
                          styles.calCell,
                          !cell.inCurrentMonth && styles.calCellMuted,
                          cell.isToday && styles.calCellToday,
                          selected && styles.calCellSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${cell.dayOfMonth}${cell.dotColors.length ? ', bills scheduled' : ''}`}
                      >
                        <Text
                          style={[
                            styles.calNum,
                            !cell.inCurrentMonth && styles.calNumMuted,
                            cell.isToday && styles.calNumToday,
                          ]}
                        >
                          {cell.dayOfMonth}
                        </Text>
                        <View style={styles.calDots}>
                          {cell.dotColors.map((color, idx) => (
                            <View key={`${cell.key}-d-${idx}`} style={[styles.calDot, { backgroundColor: color }]} />
                          ))}
                          {cell.overflowCount > 0 ? (
                            <Text style={styles.calOverflow}>+{cell.overflowCount}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>

        {selectedKey && selectedDate ? (
          <View style={[styles.dayDetail, { width: calCardW }]}>
            <View style={styles.dayDetailHeader}>
              <Text style={styles.dayDetailLbl}>{formatDayDetailHeader(selectedDate).toUpperCase()}</Text>
            </View>
            {selectedSubs.length === 0 ? (
              <View style={styles.dayDetailEmpty}>
                <Text style={styles.dayDetailEmptyTxt}>No subscriptions bill on this day</Text>
              </View>
            ) : (
              selectedSubs.map((sub) => (
                <Pressable
                  key={sub.id}
                  onPress={() => openSubscription(sub.id)}
                  style={styles.dayBillRow}
                  accessibilityRole="button"
                  accessibilityLabel={`${sub.displayName}, open details`}
                >
                  <ServiceIcon
                    serviceName={sub.serviceNameForIcon}
                    serviceId={sub.catalogServiceId}
                    size={34}
                    style={styles.svcIco}
                  />
                  <View style={styles.dayBillMid}>
                    <Text style={styles.dayBillName} numberOfLines={2}>
                      {sub.displayName}
                    </Text>
                    <Text style={styles.dayBillSub} numberOfLines={2}>
                      Your share: {formatSummaryMoney(sub.yourShareCents)} · {sub.statusBadge.label}
                    </Text>
                  </View>
                  <View style={styles.dayBillRight}>
                    <Text style={styles.dayBillTotal}>{formatSummaryMoney(sub.totalCents)}</Text>
                    <Text style={[styles.dayBillBadge, { color: sub.statusBadge.textColor }]}>
                      {sub.statusBadge.label}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const CELL_MIN = 52;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  hero: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backLbl: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
    flex: 1,
  },
  todayBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  todayBtnTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
  },
  monthSummary: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 10,
  },
  msCell: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  msVal: {
    fontSize: 21,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
  },
  msValPurple: { color: C.purple },
  msValGreen: { color: C.green },
  msValOrange: { color: C.orange },
  msLbl: {
    marginTop: 4,
    fontSize: 13,
    color: C.muted,
  },
  calCard: {
    alignSelf: 'center',
    marginHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  calNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonth: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.3,
  },
  calGrid: {
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  calDow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calDowCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.4,
  },
  calDays: {
    width: '100%',
  },
  calWeekRow: {
    flexDirection: 'row',
    width: '100%',
  },
  calCell: {
    flex: 1,
    minWidth: 0,
    minHeight: CELL_MIN,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  calCellMuted: {
    opacity: 0.38,
  },
  calCellToday: {},
  calCellSelected: {
    backgroundColor: C.lavender,
  },
  calNum: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    width: 30,
    height: 30,
    textAlign: 'center',
    lineHeight: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  calNumMuted: {
    fontWeight: '500',
  },
  calNumToday: {
    backgroundColor: C.purple,
    color: '#fff',
    overflow: 'hidden',
  },
  calDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    minHeight: 10,
    maxWidth: 48,
    marginTop: 3,
  },
  calDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  calOverflow: {
    fontSize: 10,
    fontWeight: '700',
    color: C.muted,
    marginLeft: 1,
  },
  dayDetail: {
    width: '100%',
    alignSelf: 'center',
    marginHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  dayDetailHeader: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FAFAF8',
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0EEE9',
  },
  dayDetailLbl: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
  },
  dayDetailEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  dayDetailEmptyTxt: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
  },
  dayBillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F5F3EE',
  },
  svcIco: {
    borderRadius: 8,
  },
  dayBillMid: {
    flex: 1,
    minWidth: 0,
  },
  dayBillName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  dayBillSub: {
    marginTop: 3,
    fontSize: 13,
    color: C.muted,
  },
  dayBillRight: {
    alignItems: 'flex-end',
  },
  dayBillTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  dayBillBadge: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
});
