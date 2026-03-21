import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

type IonIconName = React.ComponentProps<typeof Ionicons>['name'];

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  text: '#1a1a18',
  divider: '#F0EEE9',
  green: '#1D9E75',
  orange: '#EF9F27',
  red: '#E24B4A',
  amberIconBg: '#FAEEDA',
  amberIcon: '#854F0B',
};

/** Replace with subscription / payment API results. */
type OverdueOwedItem = {
  id: string;
  memberId: string;
  memberFirstName: string;
  amount: number;
  daysOverdue: number;
  subscriptionName: string;
  lastReminderLabel: string;
};

type UpcomingBillItem = {
  id: string;
  subscriptionName: string;
  amount: number;
  /** Bill charge date (next cycle). */
  dueAt: Date;
  subLabel: string;
};

/** Clear both lists to hide the card when everything is settled. Use `[]` for overdue-only tests. */
const MOCK_OVERDUE_ITEMS: OverdueOwedItem[] = [
  {
    id: 'ov-sam-netflix',
    memberId: 'member-sam',
    memberFirstName: 'Sam',
    amount: 5.33,
    daysOverdue: 3,
    subscriptionName: 'Netflix',
    lastReminderLabel: 'last reminder 1 day ago',
  },
  {
    id: 'ov-alex-spotify',
    memberId: 'member-alex',
    memberFirstName: 'Alex',
    amount: 3.4,
    daysOverdue: 1,
    subscriptionName: 'Spotify Family',
    lastReminderLabel: 'last reminder 4 days ago',
  },
];

const MOCK_UPCOMING_BILLS: UpcomingBillItem[] = [
  {
    id: 'up-spotify',
    subscriptionName: 'Spotify Family',
    amount: 16.99,
    dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    subLabel: '5 members · auto-charge',
  },
  {
    id: 'up-netflix',
    subscriptionName: 'Netflix Premium',
    amount: 22.99,
    dueAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    subLabel: '3 members · auto-charge',
  },
];

type UrgentFloatCard =
  | {
      kind: 'overdue';
      id: string;
      memberId: string;
      memberFirstName: string;
      title: string;
      subtitle: string;
    }
  | {
      kind: 'upcoming';
      id: string;
      title: string;
      subtitle: string;
    };

function pickUrgentFloatCard(
  overdue: OverdueOwedItem[],
  upcoming: UpcomingBillItem[],
): UrgentFloatCard | null {
  const sortedOverdue = [...overdue]
    .filter((o) => o.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  if (sortedOverdue.length > 0) {
    const o = sortedOverdue[0]!;
    const dayWord = o.daysOverdue === 1 ? 'day' : 'days';
    return {
      kind: 'overdue',
      id: o.id,
      memberId: o.memberId,
      memberFirstName: o.memberFirstName,
      title: `${o.memberFirstName} owes $${o.amount.toFixed(2)} — ${o.daysOverdue} ${dayWord} overdue`,
      subtitle: `${o.subscriptionName} · ${o.lastReminderLabel}`,
    };
  }

  const now = Date.now();
  const future = [...upcoming]
    .filter((b) => b.dueAt.getTime() > now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  if (future.length > 0) {
    const u = future[0]!;
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.ceil((u.dueAt.getTime() - now) / msPerDay));
    const dayWord = days === 1 ? 'day' : 'days';
    return {
      kind: 'upcoming',
      id: u.id,
      title: `${u.subscriptionName} · $${u.amount.toFixed(2)} due in ${days} ${dayWord}`,
      subtitle: u.subLabel,
    };
  }

  return null;
}

async function sendMemberNudgePush(_memberId: string, _memberFirstName: string): Promise<void> {
  // Wire to your API → APNs/FCM for the member’s device.
}

type ActivityFilterId = 'all' | 'received' | 'pending' | 'failed' | 'audit' | 'receipts';

const FILTER_PILLS: {
  id: ActivityFilterId;
  label: string;
  dotColor: string | null;
}[] = [
  { id: 'all', label: 'All', dotColor: null },
  { id: 'received', label: 'Received', dotColor: '#4ade80' },
  { id: 'pending', label: 'Pending', dotColor: '#fbbf24' },
  { id: 'failed', label: 'Failed', dotColor: '#f87171' },
  { id: 'audit', label: 'Changes', dotColor: '#a78bfa' },
  { id: 'receipts', label: 'Receipts', dotColor: '#93c5fd' },
];

type ActivityKind =
  | 'received'
  | 'overdue'
  | 'partial'
  | 'failed'
  | 'audit'
  | 'updated'
  | 'receipt';

type ActivityBadgeVariant = 'green' | 'amber' | 'red' | 'purple' | 'gray';

type ActivityDetailRow = { label: string; value: string; link?: boolean };

type ActivityFeedItem = {
  id: string;
  kind: ActivityKind;
  icon: IonIconName;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  note?: string;
  time: string;
  amount?: string;
  amountColor: string;
  badge: string;
  badgeVariant: ActivityBadgeVariant;
  partial?: { paid: number; total: number };
  detail?: {
    rows: ActivityDetailRow[];
    actions?: { label: string; variant: 'ghost' | 'primary' | 'danger' }[];
  };
};

type ActivityFeedGroup = { sectionTitle: string; items: ActivityFeedItem[] };

function itemMatchesFilter(item: ActivityFeedItem, f: ActivityFilterId): boolean {
  if (f === 'all') return true;
  switch (f) {
    case 'received':
      return item.kind === 'received';
    case 'pending':
      return item.kind === 'overdue' || item.kind === 'partial';
    case 'failed':
      return item.kind === 'failed';
    case 'audit':
      return item.kind === 'audit' || item.kind === 'updated';
    case 'receipts':
      return item.kind === 'receipt';
    default:
      return true;
  }
}

const MOCK_ACTIVITY_GROUPS: ActivityFeedGroup[] = [
  {
    sectionTitle: 'Today',
    items: [
      {
        id: 't1',
        kind: 'received',
        icon: 'checkmark',
        iconBg: '#E1F5EE',
        iconColor: '#1D9E75',
        title: 'Alex paid Spotify Family',
        sub: 'Mar cycle · Visa ···· 4242',
        time: '2 min ago',
        amount: '+$3.40',
        amountColor: '#1D9E75',
        badge: 'Received',
        badgeVariant: 'green',
        detail: {
          rows: [
            { label: 'From', value: 'Alex L. · Visa ···· 4242' },
            { label: 'For', value: 'Spotify Family — March' },
            { label: 'Method', value: 'Auto-charged via Stripe' },
            { label: 'Stripe ref', value: 'pi_3Nx8aB···', link: true },
          ],
          actions: [
            { label: 'View receipt', variant: 'ghost' },
            { label: 'See all from Alex', variant: 'primary' },
          ],
        },
      },
      {
        id: 't2',
        kind: 'overdue',
        icon: 'time-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: 'Sam · Netflix overdue',
        sub: '$5.33 · 3 days past due · 2 reminders sent',
        time: 'Due Mar 15',
        amount: '$5.33',
        amountColor: '#EF9F27',
        badge: 'Overdue',
        badgeVariant: 'amber',
        detail: {
          rows: [
            { label: 'Status', value: '3 days overdue' },
            { label: 'Reminders', value: '2 sent · last Mar 16' },
            { label: 'Subscription', value: 'Netflix Premium' },
          ],
          actions: [
            { label: 'Mark paid manually', variant: 'ghost' },
            { label: 'Send reminder', variant: 'primary' },
          ],
        },
      },
      {
        id: 't3',
        kind: 'partial',
        icon: 'checkmark-done-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: 'Taylor paid partial · iCloud',
        sub: 'Paid $1.25 of $2.50 · balance remaining',
        note: '"Will send the rest Friday"',
        time: '1 hr ago',
        amount: '+$1.25',
        amountColor: '#EF9F27',
        badge: 'Partial',
        badgeVariant: 'amber',
        partial: { paid: 1.25, total: 2.5 },
        detail: {
          rows: [
            { label: 'Paid so far', value: '$1.25' },
            { label: 'Remaining', value: '$1.25' },
            { label: 'Note from Taylor', value: '"Will send the rest Friday"' },
          ],
          actions: [
            { label: 'Remind for rest', variant: 'ghost' },
            { label: 'Mark remainder paid', variant: 'primary' },
          ],
        },
      },
      {
        id: 't4',
        kind: 'audit',
        icon: 'create-outline',
        iconBg: '#EEEDFE',
        iconColor: '#534AB7',
        title: 'Split percentages updated',
        sub: 'Netflix · changed by Jordan · effective next cycle',
        time: '3 hrs ago',
        badge: 'Audit',
        badgeVariant: 'purple',
        amountColor: C.text,
        detail: {
          rows: [
            { label: 'Changed by', value: 'Jordan (you)' },
            { label: 'Subscription', value: 'Netflix Premium' },
            { label: 'Jordan', value: '33% → 40%' },
            { label: 'Alex', value: '33% → 30%' },
            { label: 'Sam', value: '34% → 30%' },
            { label: 'Effective', value: 'Next cycle · Apr 18' },
          ],
        },
      },
    ],
  },
  {
    sectionTitle: 'Yesterday',
    items: [
      {
        id: 'y1',
        kind: 'received',
        icon: 'checkmark',
        iconBg: '#E1F5EE',
        iconColor: '#1D9E75',
        title: 'Taylor paid Xbox Game Pass',
        sub: 'Mar cycle · marked manually',
        note: '"Sent via Venmo @taylor_r"',
        time: 'Mar 15 · 4:22 PM',
        amount: '+$7.50',
        amountColor: '#1D9E75',
        badge: 'Received',
        badgeVariant: 'green',
        detail: {
          rows: [
            { label: 'Method', value: 'Marked paid manually' },
            { label: 'Recorded by', value: 'Taylor R.' },
            { label: 'Timestamp', value: 'Mar 15 · 4:22 PM' },
          ],
        },
      },
      {
        id: 'y2',
        kind: 'failed',
        icon: 'alert-circle-outline',
        iconBg: '#FCEBEB',
        iconColor: '#A32D2D',
        title: "Sam's payment failed — Hulu",
        sub: 'Card declined · Stripe retrying · attempt 2 of 4',
        time: 'Mar 15 · 9:01 AM',
        amount: '$4.00',
        amountColor: '#E24B4A',
        badge: 'Failed',
        badgeVariant: 'red',
        detail: {
          rows: [
            { label: 'Reason', value: 'Card declined' },
            { label: 'Retry', value: 'Attempt 2 of 4 · next in 2 days' },
            { label: 'Stripe ref', value: 'pi_err_3Nx···', link: true },
          ],
          actions: [
            { label: 'Message Sam', variant: 'ghost' },
            { label: 'Retry now', variant: 'danger' },
          ],
        },
      },
      {
        id: 'y3',
        kind: 'updated',
        icon: 'information-circle-outline',
        iconBg: '#E6F1FB',
        iconColor: '#185FA5',
        title: 'Netflix price updated',
        sub: '$19.99 → $22.99 · updated by Jordan · group notified',
        time: 'Mar 15 · 8:00 AM',
        badge: 'Updated',
        badgeVariant: 'gray',
        amountColor: C.text,
        detail: {
          rows: [
            { label: 'Updated by', value: 'Jordan (you)' },
            { label: 'Old price', value: '$19.99/month' },
            { label: 'New price', value: '$22.99/month' },
            { label: 'Effective', value: 'Next cycle only' },
          ],
        },
      },
    ],
  },
  {
    sectionTitle: 'Mar 14',
    items: [
      {
        id: 'm1',
        kind: 'receipt',
        icon: 'receipt-outline',
        iconBg: '#EEEDFE',
        iconColor: '#534AB7',
        title: 'Olive Garden',
        sub: '3 people · 7 items · 1 pending payment',
        time: 'Mar 14',
        amount: '$49.52',
        amountColor: C.text,
        badge: '1 pending',
        badgeVariant: 'amber',
        detail: {
          rows: [
            { label: 'Total', value: '$49.52' },
            { label: 'Your share', value: '$16.51' },
          ],
          actions: [{ label: 'Open receipt', variant: 'primary' }],
        },
      },
      {
        id: 'm2',
        kind: 'receipt',
        icon: 'receipt-outline',
        iconBg: '#EEEDFE',
        iconColor: '#534AB7',
        title: 'Chipotle',
        sub: '2 people · 4 items · settled',
        time: 'Mar 14',
        amount: '$24.80',
        amountColor: C.text,
        badge: 'Settled',
        badgeVariant: 'green',
      },
    ],
  },
];

function badgeStyles(v: ActivityBadgeVariant) {
  switch (v) {
    case 'green':
      return { bg: '#E1F5EE', text: '#0F6E56' };
    case 'amber':
      return { bg: '#FAEEDA', text: '#854F0B' };
    case 'red':
      return { bg: '#FCEBEB', text: '#A32D2D' };
    case 'purple':
      return { bg: '#EEEDFE', text: '#534AB7' };
    default:
      return { bg: '#F0EEE9', text: '#5F5E5A' };
  }
}

type ActivityItemRowProps = {
  item: ActivityFeedItem;
  showTimelineLine: boolean;
  expanded: boolean;
  onToggle: () => void;
};

function ActivityItemRow({ item, showTimelineLine, expanded, onToggle }: ActivityItemRowProps) {
  const b = badgeStyles(item.badgeVariant);
  const hasDetail = Boolean(
    item.detail && (item.detail.rows.length > 0 || (item.detail.actions?.length ?? 0) > 0),
  );

  return (
    <View style={styles.actItem}>
      <Pressable
        onPress={hasDetail ? onToggle : undefined}
        style={styles.actMain}
        accessibilityRole={hasDetail ? 'button' : 'none'}
        accessibilityState={hasDetail ? { expanded } : undefined}
      >
        <View style={styles.actLeft}>
          <View style={[styles.actIco, { backgroundColor: item.iconBg }]}>
            <Ionicons name={item.icon} size={18} color={item.iconColor} />
          </View>
          {showTimelineLine ? <View style={styles.actLine} /> : null}
        </View>
        <View style={styles.actContent}>
          <Text style={styles.actTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.actSub} numberOfLines={2}>
            {item.sub}
          </Text>
          {item.note ? (
            <Text style={styles.actNote} numberOfLines={2}>
              {item.note}
            </Text>
          ) : null}
          <Text style={styles.actTime}>{item.time}</Text>
        </View>
        <View style={styles.actRight}>
          {item.amount ? (
            <Text style={[styles.actAmt, { color: item.amountColor }]}>{item.amount}</Text>
          ) : null}
          <View style={[styles.badge, { backgroundColor: b.bg }]}>
            <Text style={[styles.badgeText, { color: b.text }]}>{item.badge}</Text>
          </View>
        </View>
      </Pressable>

      {item.partial ? (
        <View style={styles.partialWrap}>
          <View style={styles.partialLabelRow}>
            <Text style={styles.partialLbl}>
              ${item.partial.paid.toFixed(2)} of ${item.partial.total.toFixed(2)} paid
            </Text>
            <Text style={styles.partialAmt}>
              ${(item.partial.total - item.partial.paid).toFixed(2)} remaining
            </Text>
          </View>
          <View style={styles.partialTrack}>
            <View
              style={[
                styles.partialFill,
                { width: `${Math.min(100, (item.partial.paid / item.partial.total) * 100)}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      {expanded && item.detail ? (
        <View style={styles.actDetail}>
          {item.detail.rows.map((row) => (
            <View key={`${item.id}-${row.label}`} style={styles.detailRow}>
              <Text style={styles.drLbl}>{row.label}</Text>
              <Text
                style={[styles.drVal, row.link && styles.drValLink]}
                numberOfLines={2}
              >
                {row.value}
              </Text>
            </View>
          ))}
          {item.detail.actions && item.detail.actions.length > 0 ? (
            <View style={styles.actionRow}>
              {item.detail.actions.map((a) => (
                <Pressable
                  key={a.label}
                  style={[
                    styles.actBtn,
                    a.variant === 'ghost' && styles.actBtnGhost,
                    a.variant === 'primary' && styles.actBtnPrimary,
                    a.variant === 'danger' && styles.actBtnDanger,
                  ]}
                  onPress={() => {}}
                >
                  <Text
                    style={[
                      styles.actBtnText,
                      a.variant === 'ghost' && styles.actBtnTextGhost,
                      a.variant === 'primary' && styles.actBtnTextPrimary,
                      a.variant === 'danger' && styles.actBtnTextDanger,
                    ]}
                    numberOfLines={1}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ActivityFilterId>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const collectedDisplay = useMemo(() => '+$47.50', []);
  const trendDisplay = useMemo(() => '↑ $12 vs last month', []);
  const pendingCount = 3;
  const pendingBreakdown = '1 overdue · 1 partial';

  const overdueItems = MOCK_OVERDUE_ITEMS;
  const upcomingBills = MOCK_UPCOMING_BILLS;

  const urgentCard = useMemo(
    () => pickUrgentFloatCard(overdueItems, upcomingBills),
    [overdueItems, upcomingBills],
  );

  const onNudge = useCallback((card: Extract<UrgentFloatCard, { kind: 'overdue' }>) => {
    void sendMemberNudgePush(card.memberId, card.memberFirstName);
    Alert.alert(
      'Nudge sent',
      `We'll send a payment reminder to ${card.memberFirstName}.`,
      [{ text: 'OK' }],
    );
  }, []);

  const filteredGroups = useMemo(() => {
    return MOCK_ACTIVITY_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => itemMatchesFilter(i, filter)),
    })).filter((g) => g.items.length > 0);
  }, [filter]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  React.useEffect(() => {
    setExpandedIds({});
  }, [filter]);

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
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={[
            styles.hero,
            {
              paddingTop: Math.max(insets.top, 12) + 4,
            },
          ]}
        >
          <View style={styles.sbar}>
            <Text style={styles.pageTitle}>Activity</Text>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Search activity"
            >
              <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.hstat}>
              <Text style={styles.hstatValGreen}>{collectedDisplay}</Text>
              <Text style={styles.hstatLbl}>Collected this month</Text>
              <Text style={styles.hstatSubGreen}>{trendDisplay}</Text>
            </View>
            <View style={styles.hstat}>
              <Text style={styles.hstatValWhite}>{pendingCount}</Text>
              <Text style={styles.hstatLbl}>Pending payments</Text>
              <Text style={styles.hstatSubAmber}>{pendingBreakdown}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTER_PILLS.map((p) => {
              const active = filter === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setFilter(p.id)}
                  style={[styles.fpill, active ? styles.fpillOn : styles.fpillOff]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  {p.dotColor ? (
                    <View style={[styles.fpillDot, { backgroundColor: p.dotColor }]} />
                  ) : null}
                  <Text style={[styles.fpillText, active ? styles.fpillTextOn : styles.fpillTextOff]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </LinearGradient>

        {urgentCard ? (
          <View style={styles.floatCard}>
            <View style={styles.fcIcon}>
              <Ionicons name="alert-circle-outline" size={24} color={C.amberIcon} />
            </View>
            <View style={styles.fcTextCol}>
              <Text style={styles.fcTitle} numberOfLines={2}>
                {urgentCard.title}
              </Text>
              <Text style={styles.fcSub} numberOfLines={2}>
                {urgentCard.subtitle}
              </Text>
            </View>
            {urgentCard.kind === 'overdue' ? (
              <Pressable
                style={styles.nudgeBtn}
                onPress={() => onNudge(urgentCard)}
                accessibilityRole="button"
                accessibilityLabel={`Nudge ${urgentCard.memberFirstName}`}
              >
                <Text style={styles.nudgeBtnText}>Nudge</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.body, urgentCard ? styles.bodyAfterFloat : null]}>
          {filteredGroups.length === 0 ? (
            <View style={styles.feedEmpty}>
              <Text style={styles.feedEmptyText}>No activity for this filter.</Text>
            </View>
          ) : (
            filteredGroups.map((group, gi) => (
              <View key={group.sectionTitle} style={gi > 0 ? styles.feedSection : styles.feedSectionFirst}>
                <View style={styles.sh}>
                  <Text style={styles.shTitle}>{group.sectionTitle}</Text>
                </View>
                {group.items.map((item, ii) => (
                  <ActivityItemRow
                    key={item.id}
                    item={item}
                    showTimelineLine={ii < group.items.length - 1}
                    expanded={Boolean(expandedIds[item.id])}
                    onToggle={() => toggleExpanded(item.id)}
                  />
                ))}
              </View>
            ))
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
    paddingBottom: 24,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  sbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.35,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  hstat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 16,
    minHeight: 100,
    justifyContent: 'center',
  },
  hstatValGreen: {
    fontSize: 30,
    fontWeight: '600',
    color: '#86efac',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  hstatValWhite: {
    fontSize: 30,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  hstatLbl: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
  },
  hstatSubGreen: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 5,
    color: 'rgba(134,239,172,0.8)',
    lineHeight: 18,
  },
  hstatSubAmber: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 5,
    color: 'rgba(251,191,36,0.9)',
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
    paddingBottom: 4,
  },
  fpill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 17,
    minHeight: 44,
  },
  fpillOn: {
    backgroundColor: '#fff',
  },
  fpillOff: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fpillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fpillText: {
    fontSize: 16,
    fontWeight: '500',
  },
  fpillTextOn: {
    color: '#534AB7',
  },
  fpillTextOff: {
    color: 'rgba(255,255,255,0.7)',
  },
  floatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 22,
    marginHorizontal: 16,
    marginTop: -18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 14,
    elevation: 4,
  },
  fcIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.amberIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcTextCol: {
    flex: 1,
    minWidth: 0,
  },
  fcTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    lineHeight: 21,
  },
  fcSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
    lineHeight: 18,
  },
  nudgeBtn: {
    backgroundColor: C.purple,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 24,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nudgeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  bodyAfterFloat: {
    paddingTop: 10,
  },
  feedSectionFirst: {
    marginTop: 4,
  },
  feedSection: {
    marginTop: 16,
  },
  sh: {
    marginBottom: 8,
  },
  shTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  feedEmpty: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  feedEmptyText: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  actItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  actMain: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  actLeft: {
    width: 40,
    alignItems: 'center',
  },
  actIco: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actLine: {
    width: 2,
    flex: 1,
    backgroundColor: C.divider,
    marginTop: 4,
    minHeight: 12,
    borderRadius: 1,
  },
  actContent: {
    flex: 1,
    minWidth: 0,
  },
  actTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    lineHeight: 20,
  },
  actSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  actNote: {
    fontSize: 13,
    color: C.purple,
    marginTop: 4,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  actTime: {
    fontSize: 12,
    color: '#B4B2A9',
    marginTop: 4,
    lineHeight: 16,
  },
  actRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  actAmt: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  partialWrap: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 13,
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
  },
  partialLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  partialLbl: {
    fontSize: 13,
    color: C.muted,
  },
  partialAmt: {
    fontSize: 13,
    fontWeight: '500',
    color: C.orange,
  },
  partialTrack: {
    height: 5,
    backgroundColor: C.divider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  partialFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: C.orange,
  },
  actDetail: {
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FAFAF8',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  drLbl: {
    fontSize: 13,
    color: C.muted,
    flexShrink: 0,
    lineHeight: 18,
  },
  drVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: C.text,
    textAlign: 'right',
    lineHeight: 18,
  },
  drValLink: {
    color: C.purple,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  actBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actBtnGhost: {
    backgroundColor: C.divider,
  },
  actBtnPrimary: {
    backgroundColor: C.purple,
  },
  actBtnDanger: {
    backgroundColor: '#FCEBEB',
  },
  actBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actBtnTextGhost: {
    color: '#5F5E5A',
  },
  actBtnTextPrimary: {
    color: '#fff',
  },
  actBtnTextDanger: {
    color: '#A32D2D',
  },
});
