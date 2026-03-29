import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getFriendFilterDisplayName } from '../../lib/profile';
import { ServiceIcon } from '../components/shared/ServiceIcon';
import { UserAvatarCircle } from '../components/shared/UserAvatarCircle';
import { recordManualSettlement } from '../../lib/payment/paymentsFirestore';
import { useFirebaseUid } from '../../lib/auth/useFirebaseUid';
import { markActivityDocumentRead, subscribeActivityFeed } from '../../lib/activity/activityFeedFirestore';
import type { ActivityEvent, ActivityEventType } from '../../lib/activity/activityFeedSchema';
import { activityEventToFeedRow } from '../../lib/activity/activityEventToFeedItem';
import {
  activityEventMatchesFilter,
  type ActivityFilterTabId,
} from '../../lib/activity/activityFilters';
import { resolveActivityRoute } from '../../lib/activity/activityNavigation';
import { sendPaymentReminderCallable } from '../../lib/activity/sendPaymentReminderCallable';
import { acceptPendingInvite } from '../../lib/friends/friendSystemFirestore';

type IonIconName = React.ComponentProps<typeof Ionicons>['name'];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  text: '#1a1a18',
  divider: '#F0EEE9',
  green: '#1D9E75',
  orange: '#EF9F27',
  /** Partial progress + remaining (HTML partial-fill). */
  partialAmber: '#EF9F27',
  red: '#E24B4A',
};

type ActivityFilterId = ActivityFilterTabId;

const FILTER_PILLS: {
  id: ActivityFilterId;
  label: string;
  dotColor: string | null;
}[] = [
  { id: 'all', label: 'All', dotColor: null },
  { id: 'payments', label: 'Payments', dotColor: '#4ade80' },
  { id: 'splits', label: 'Splits', dotColor: '#a78bfa' },
  { id: 'friends', label: 'Friends', dotColor: '#93c5fd' },
];

type ActivityKind =
  | 'received'
  | 'payment_sent'
  | 'overdue'
  | 'partial'
  | 'failed'
  | 'audit'
  | 'updated'
  | 'receipt'
  /** Non-payment audit / ledger events (Changes filter). */
  | 'audit_join'
  | 'audit_reminder'
  | 'audit_ended'
  | 'reminder_sent'
  | 'reminder_received'
  | 'split_invite_received'
  | 'split_invite_sent'
  | 'split_invite_accepted'
  | 'split_invite_declined'
  | 'split_invite_expired'
  | 'split_member_joined'
  | 'split_member_removed'
  | 'split_ended'
  | 'split_restarted'
  | 'split_percentage_updated'
  | 'split_price_updated'
  | 'friend_connected'
  | 'friend_invite_accepted'
  | 'billing_cycle_complete'
  | 'billing_cycle_partial'
  | 'auto_charge_enabled'
  | 'auto_charge_disabled';

type ActivityBadgeVariant = 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'blue';

type ActivityDetailRow = {
  label: string;
  value: string;
  link?: boolean;
  /** Remaining / emphasis in drawer (amber). */
  valueAccent?: 'amber';
};

type ActivityDetailAction = {
  id: string;
  label: string;
  variant: 'ghost' | 'primary' | 'danger';
  /** Shows â†— after label (e.g. open member activity). */
  external?: boolean;
  /** Opens inline mark-as-paid row below the drawer. */
  opensMarkPaid?: boolean;
};

type ManualSettlementRecord = {
  status: 'paid';
  settlementMethod: 'manual';
  noteText: string;
  recordedByUserId: string;
  recordedAt: number;
};

async function persistManualSettlementToFirestore(
  activityItemId: string,
  record: ManualSettlementRecord,
): Promise<void> {
  await recordManualSettlement(activityItemId, record.recordedByUserId, record.noteText);
}

function itemEligibleForMarkPaid(item: ActivityFeedItem): boolean {
  return item.kind === 'overdue' || item.kind === 'partial';
}

function applyManualPaidToItem(
  item: ActivityFeedItem,
  record: ManualSettlementRecord,
): ActivityFeedItem {
  const settledAmount =
    item.partial != null
      ? `+$${item.partial.total.toFixed(2)}`
      : item.amount?.startsWith('$')
        ? item.amount
        : item.amount;
  return {
    ...item,
    activityType: item.activityType,
    kind: 'received',
    icon: 'checkmark',
    iconBg: '#E1F5EE',
    iconColor: '#1D9E75',
    badge: 'Paid',
    badgeVariant: 'green',
    amount: settledAmount ?? item.amount,
    amountColor: C.green,
    payerNote: record.noteText ? `"${record.noteText}"` : item.payerNote,
    partial: undefined,
    sub: 'Marked paid manually',
    detail: item.detail
      ? {
          rows: [
            { label: 'Method', value: 'Marked paid manually' },
            ...(record.noteText ? [{ label: 'Settlement note', value: record.noteText }] : []),
            { label: 'Recorded by', value: record.recordedByUserId },
            {
              label: 'Timestamp',
              value: new Date(record.recordedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }),
            },
          ],
        }
      : undefined,
  };
}

/**
 * Activity list row; aligns with `payments` (or ledger) docs:
 * - `status` maps to kind (e.g. partial, overdue, received)
 * - `partial_amount` maps to partial.paid (amount received toward total)
 * - `amount` / total owed maps to partial.total when partial
 * - `note` maps to payerNote (optional message from payer)
 */
type ActivityFeedItem = {
  id: string;
  /** Profile -> Activity: filter feed to items involving this friend id */
  friendLinkIds?: string[];
  kind: ActivityKind;
  /** Letter-mark icon for subscription or receipt merchant; when set, overrides `icon`. */
  serviceMark?: string;
  icon: IonIconName;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  /** Free-form payer message (italic blue in UI). Maps to Firestore `note`. */
  payerNote?: string;
  time: string;
  /** For partial: show amount paid (e.g. +$1.25), not full balance. */
  amount?: string;
  amountColor: string;
  badge: string;
  badgeVariant: ActivityBadgeVariant;
  /** Partial settlement: paid <-> partial_amount, total <-> amount due. */
  partial?: { paid: number; total: number };
  detail?: {
    rows: ActivityDetailRow[];
    actions?: ActivityDetailAction[];
  };
  /** Firestore `createdAt` (ms) for live feed grouping. */
  _activityCreatedAtMs?: number;
  _reminderTap?: { subscriptionId: string; memberUid: string };
  joinSubscriptionId?: string;
  joinInviteId?: string;
  serviceIconMuted?: boolean;
  friendAvatar?: { initials: string; imageUrl?: string | null };
  /** Raw Firestore event type — drives filter tabs. */
  activityType: ActivityEventType;
  /** Server + optimistic client read state */
  read?: boolean;
  subscriptionId?: string;
};

type ActivityFeedGroup = { sectionTitle: string; items: ActivityFeedItem[] };

function itemMatchesFriend(item: ActivityFeedItem, friendId: string | null): boolean {
  if (!friendId) return true;
  const ids = item.friendLinkIds;
  return Boolean(ids?.includes(friendId));
}

function itemMatchesFilter(item: ActivityFeedItem, f: ActivityFilterId): boolean {
  return activityEventMatchesFilter(f, item.activityType);
}


function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayBucketKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sectionTitleForDayKey(key: string, d: Date): string {
  if (key === '__today__') return 'Today';
  if (key === '__yesterday__') return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Groups by calendar day (items must be newest-first). */
function groupLiveItemsBySection(items: ActivityFeedItem[]): ActivityFeedGroup[] {
  const todayStart = startOfDayLocal(new Date()).getTime();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterdayStart = startOfDayLocal(y).getTime();

  const order: string[] = [];
  const buckets = new Map<string, ActivityFeedItem[]>();

  for (const item of items) {
    const ms = item._activityCreatedAtMs;
    if (ms == null) continue;
    const d = new Date(ms);
    const ds = startOfDayLocal(d).getTime();
    let key: string;
    if (ds === todayStart) key = '__today__';
    else if (ds === yesterdayStart) key = '__yesterday__';
    else key = dayBucketKey(d);

    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }

  return order.map((key) => {
    const first = buckets.get(key)![0];
    const ms = first._activityCreatedAtMs ?? 0;
    const d = new Date(ms);
    return {
      sectionTitle: sectionTitleForDayKey(key, d),
      items: buckets.get(key)!,
    };
  });
}

function findBaseActivityItem(
  itemId: string,
  liveItems: ActivityFeedItem[],
): ActivityFeedItem | undefined {
  return liveItems.find((i) => i.id === itemId);
}

function shouldShowMarkPaidInline(
  itemId: string,
  f: ActivityFilterId,
  paidMap: Record<string, ManualSettlementRecord>,
  drawerOpenId: string | null,
  liveItems: ActivityFeedItem[],
): boolean {
  if (paidMap[itemId]) return false;
  const base = findBaseActivityItem(itemId, liveItems);
  if (!base || !itemEligibleForMarkPaid(base)) return false;
  if (f === 'all' || f === 'payments') return true;
  return drawerOpenId === itemId;
}

function openStripeReference(displayValue: string) {
  void Linking.openURL('https://dashboard.stripe.com/').catch(() => {
    Alert.alert('Stripe reference', displayValue);
  });
}

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
    case 'blue':
      return { bg: '#E6F1FB', text: '#185FA5' };
    default:
      return { bg: '#F0EEE9', text: '#5F5E5A' };
  }
}

type ActivityItemRowProps = {
  item: ActivityFeedItem;
  showTimelineLine: boolean;
  expanded: boolean;
  onToggle: () => void;
  showMarkPaidRow: boolean;
  markPaidNote: string;
  onMarkPaidNoteChange: (text: string) => void;
  onConfirmMarkPaid: () => void;
  onDetailAction: (action: ActivityDetailAction) => void;
  /** Receipts filter: tap row opens receipt detail instead of inline drawer. */
  receiptNavigateMode: boolean;
  onReceiptPress: () => void;
  /** Split invite row: accept invite then open subscription. */
  onJoinSplitPress?: (subscriptionId: string, inviteId?: string) => void;
  /** Primary row tap: mark read + navigate (or expand detail when no route). */
  onActivityPress?: () => void;
};

function ActivityItemRow({
  item,
  showTimelineLine,
  expanded,
  onToggle,
  showMarkPaidRow,
  markPaidNote,
  onMarkPaidNoteChange,
  onConfirmMarkPaid,
  onDetailAction,
  receiptNavigateMode,
  onReceiptPress,
  onJoinSplitPress,
  onActivityPress,
}: ActivityItemRowProps) {
  const b = badgeStyles(item.badgeVariant);
  const receiptTapOpensDetail = receiptNavigateMode && item.kind === 'receipt';
  const hasExpandableDetail = Boolean(
    !receiptTapOpensDetail &&
      item.detail &&
      (item.detail.rows.length > 0 || (item.detail.actions?.length ?? 0) > 0),
  );

  const onMainPress = () => {
    if (onActivityPress) {
      onActivityPress();
      return;
    }
    if (receiptTapOpensDetail) onReceiptPress();
    else if (hasExpandableDetail) onToggle();
  };

  const rowPressable = onActivityPress
    ? onMainPress
    : receiptTapOpensDetail || hasExpandableDetail
      ? onMainPress
      : undefined;

  return (
    <View style={[styles.actItem, item.read !== true && styles.actItemUnread]}>
      <View style={styles.actMain}>
        <Pressable
          onPress={rowPressable}
          style={styles.actMainPressable}
          accessibilityRole={onActivityPress || receiptTapOpensDetail || hasExpandableDetail ? 'button' : 'none'}
          accessibilityLabel={receiptTapOpensDetail ? `Open receipt ${item.title}` : undefined}
          accessibilityState={
            onActivityPress || hasExpandableDetail ? { expanded } : undefined
          }
        >
          <View style={styles.actLeft}>
            {item.friendAvatar ? (
              <View style={styles.actIcoPlain}>
                <UserAvatarCircle
                  size={40}
                  initials={item.friendAvatar.initials}
                  imageUrl={item.friendAvatar.imageUrl}
                />
              </View>
            ) : item.serviceMark ? (
              <View style={styles.actIcoPlain}>
                <ServiceIcon
                  serviceName={item.serviceMark}
                  size={40}
                  listEndedMuted={item.serviceIconMuted}
                />
              </View>
            ) : (
              <View style={[styles.actIco, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={18} color={item.iconColor} />
              </View>
            )}
            {showTimelineLine ? <View style={styles.actLine} /> : null}
          </View>
          <View style={styles.actContent}>
            <Text style={styles.actTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.actSub} numberOfLines={2}>
              {item.sub}
            </Text>
            {item.payerNote ? (
              <Text style={styles.actNote} numberOfLines={2}>
                {`"${item.payerNote}"`}
              </Text>
            ) : null}
            <Text style={styles.actTime}>{item.time}</Text>
          </View>
        </Pressable>
        <View style={styles.actRight}>
          {item.amount ? (
            <Text style={[styles.actAmt, { color: item.amountColor }]}>{item.amount}</Text>
          ) : null}
          {item.joinSubscriptionId && onJoinSplitPress ? (
            <Pressable
              onPress={() => onJoinSplitPress(item.joinSubscriptionId!, item.joinInviteId)}
              style={styles.joinSplitPill}
              accessibilityRole="button"
              accessibilityLabel="Join split"
            >
              <Text style={styles.joinSplitPillText}>Join</Text>
            </Pressable>
          ) : (
            <View style={[styles.badge, { backgroundColor: b.bg }]}>
              <Text style={[styles.badgeText, { color: b.text }]}>{item.badge}</Text>
            </View>
          )}
        </View>
      </View>

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

      {!receiptTapOpensDetail && expanded && item.detail ? (
        <View style={styles.actDetail}>
          {item.detail.rows.map((row, rowIdx) => (
            <View key={`${item.id}-detail-${rowIdx}`} style={styles.detailRow}>
              <Text style={styles.drLbl}>{row.label}</Text>
              {row.link ? (
                <Pressable
                  onPress={() => openStripeReference(row.value)}
                  style={styles.drValPressable}
                  accessibilityRole="link"
                  accessibilityLabel={`Stripe reference ${row.value}`}
                >
                  <Text style={styles.drValLinkText} numberOfLines={2}>
                    {row.value}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  style={[
                    styles.drVal,
                    row.valueAccent === 'amber' && styles.drValAmber,
                  ]}
                  numberOfLines={3}
                >
                  {row.value}
                </Text>
              )}
            </View>
          ))}
          {item.detail.actions && item.detail.actions.length > 0 ? (
            <View style={styles.actionRow}>
              {item.detail.actions.map((a) => (
                <Pressable
                  key={a.id}
                  style={[
                    styles.actBtn,
                    a.variant === 'ghost' && styles.actBtnGhost,
                    a.variant === 'primary' && styles.actBtnPrimary,
                    a.variant === 'danger' && styles.actBtnDanger,
                  ]}
                  onPress={() => onDetailAction(a)}
                >
                  <View style={styles.actBtnContent}>
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
                    {a.external ? (
                      <Ionicons
                        name="open-outline"
                        size={15}
                        color={a.variant === 'primary' ? '#fff' : '#5F5E5A'}
                        style={styles.actBtnExternalIcon}
                      />
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {showMarkPaidRow ? (
        <View style={styles.markPaidRow}>
          <TextInput
            style={styles.markPaidInput}
            placeholder='Add note e.g. "Paid via Venmo"'
            placeholderTextColor="#888780"
            value={markPaidNote}
            onChangeText={onMarkPaidNoteChange}
            multiline={false}
            accessibilityLabel="Settlement note"
          />
          <Pressable
            style={styles.markPaidBtn}
            onPress={onConfirmMarkPaid}
            accessibilityRole="button"
            accessibilityLabel="Mark paid"
          >
            <Text style={styles.markPaidBtnText}>Mark paid</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function ActivityScreen() {
  const uid = useFirebaseUid();
  const router = useRouter();
  const params = useLocalSearchParams<{
    filter?: string | string[];
    friendId?: string | string[];
    expandId?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ActivityFilterId>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualPaidByItemId, setManualPaidByItemId] = useState<
    Record<string, ManualSettlementRecord>
  >({});
  const [markPaidNotes, setMarkPaidNotes] = useState<Record<string, string>>({});
  const [markPaidDrawerOpenForId, setMarkPaidDrawerOpenForId] = useState<string | null>(null);
  const [liveFeedItems, setLiveFeedItems] = useState<ActivityFeedItem[]>([]);

  const friendIdFilter = useMemo(() => {
    const raw = params.friendId;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v && String(v).trim() !== '' ? String(v).trim() : null;
  }, [params.friendId]);

  useEffect(() => {
    if (friendIdFilter) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFilter('all');
      setExpandedId(null);
      setMarkPaidDrawerOpenForId(null);
      return;
    }
    const raw = params.filter;
    const f = Array.isArray(raw) ? raw[0] : raw;
    const next: ActivityFilterId | null =
      f === 'payments' || f === 'splits' || f === 'friends' || f === 'all'
        ? f
        : f === 'receipts'
          ? 'all'
          : null;
    if (next) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(null);
      setMarkPaidDrawerOpenForId(null);
      setFilter(next);
    }
  }, [params.filter, friendIdFilter]);

  useEffect(() => {
    const raw = params.expandId;
    const eid = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = eid != null && String(eid).trim() !== '' ? String(eid).trim() : '';
    if (!trimmed) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilter('all');
    setExpandedId(trimmed);
    setMarkPaidDrawerOpenForId(null);
  }, [params.expandId]);

  useEffect(() => {
    if (!uid) {
      setLiveFeedItems([]);
      return;
    }
    const unsub = subscribeActivityFeed(uid, (events) => {
      const rows: ActivityFeedItem[] = [];
      for (const e of events) {
        const row = activityEventToFeedRow(e as ActivityEvent, uid);
        if (!row) continue;
        rows.push({
          ...row,
          activityType: e.type,
          read: e.read === true,
          subscriptionId: e.subscriptionId,
        } as ActivityFeedItem);
      }
      setLiveFeedItems(rows);
    });
    return unsub;
  }, [uid]);

  const collectedDisplay = useMemo(() => '+$47.50', []);
  const trendDisplay = useMemo(() => '↑ $12 vs last month', []);
  const pendingCount = 3;
  const pendingBreakdown = '1 overdue · 1 partial';

  const filteredGroups = useMemo(() => {
    const mapped = liveFeedItems.map((i) =>
      manualPaidByItemId[i.id] ? applyManualPaidToItem(i, manualPaidByItemId[i.id]!) : i,
    );
    const liveFiltered = mapped.filter(
      (i) => itemMatchesFilter(i, filter) && itemMatchesFriend(i, friendIdFilter),
    );
    return groupLiveItemsBySection(liveFiltered);
  }, [filter, manualPaidByItemId, friendIdFilter, liveFeedItems]);

  const toggleExpanded = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const confirmMarkPaid = useCallback(
    async (itemId: string) => {
      if (manualPaidByItemId[itemId]) return;
      const note = (markPaidNotes[itemId] ?? '').trim();
      const record: ManualSettlementRecord = {
        status: 'paid',
        settlementMethod: 'manual',
        noteText: note,
        recordedByUserId: uid ?? '',
        recordedAt: Date.now(),
      };
      try {
        await persistManualSettlementToFirestore(itemId, record);
      } catch {
        Alert.alert('Could not save', 'Try again.');
        return;
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setManualPaidByItemId((p) => ({ ...p, [itemId]: record }));
      setMarkPaidDrawerOpenForId((p) => (p === itemId ? null : p));
      setMarkPaidNotes((p) => {
        const next = { ...p };
        delete next[itemId];
        return next;
      });
    },
    [manualPaidByItemId, markPaidNotes],
  );

  const applyFilter = useCallback((id: ActivityFilterId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
    setMarkPaidDrawerOpenForId(null);
    setFilter(id);
  }, []);

  const handleActivityRowPress = useCallback(
    (item: ActivityFeedItem) => {
      if (uid) {
        void markActivityDocumentRead(uid, item.id).catch(() => {});
        setLiveFeedItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
        );
      }
      const path = resolveActivityRoute({
        activityType: item.activityType,
        subscriptionId: item.subscriptionId,
        joinSubscriptionId: item.joinSubscriptionId,
        friendLinkIds: item.friendLinkIds,
      });
      if (path) {
        router.push(path as never);
        return;
      }
      const hasDetail = Boolean(
        item.detail &&
          (item.detail.rows.length > 0 || (item.detail.actions?.length ?? 0) > 0),
      );
      if (hasDetail) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedId((prev) => (prev === item.id ? null : item.id));
      }
    },
    [uid, router],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

          {friendIdFilter ? (
            <View style={styles.friendFilterBar}>
              <Text style={styles.friendFilterLabel} numberOfLines={1}>
                With {getFriendFilterDisplayName(friendIdFilter)}
              </Text>
              <Pressable
                onPress={() => router.replace('/activity')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear friend filter"
              >
                <Text style={styles.friendFilterClear}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

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
                  onPress={() => applyFilter(p.id)}
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

        <View style={styles.body}>
          {filteredGroups.length === 0 ? (
            <View style={styles.feedEmpty}>
              <Text style={styles.feedEmptyText}>
                {friendIdFilter
                  ? `No activity with ${getFriendFilterDisplayName(friendIdFilter)} yet.`
                  : filter === 'payments'
                    ? 'No payment activity yet.'
                    : filter === 'splits'
                      ? 'No split or billing activity yet.'
                      : filter === 'friends'
                        ? 'No friend activity yet.'
                        : 'No activity yet.'}
              </Text>
            </View>
          ) : (
            filteredGroups.map((group, gi) => (
              <View
                key={`${group.sectionTitle}-${gi}`}
                style={gi > 0 ? styles.feedSection : styles.feedSectionFirst}
              >
                <View style={styles.sh}>
                  <Text style={styles.shTitle}>{group.sectionTitle}</Text>
                </View>
                {group.items.map((item, ii) => (
                  <ActivityItemRow
                    key={item.id}
                    item={item}
                    showTimelineLine={ii < group.items.length - 1}
                    expanded={expandedId === item.id}
                    onToggle={() => toggleExpanded(item.id)}
                    onActivityPress={() => handleActivityRowPress(item)}
                    showMarkPaidRow={shouldShowMarkPaidInline(
                      item.id,
                      filter,
                      manualPaidByItemId,
                      markPaidDrawerOpenForId,
                      liveFeedItems,
                    )}
                    markPaidNote={markPaidNotes[item.id] ?? ''}
                    onMarkPaidNoteChange={(text) =>
                      setMarkPaidNotes((p) => ({ ...p, [item.id]: text }))
                    }
                    onConfirmMarkPaid={() => void confirmMarkPaid(item.id)}
                    onDetailAction={(action) => {
                      if (action.id === 'send-reminder' && item._reminderTap) {
                        void sendPaymentReminderCallable(item._reminderTap).catch(() => {
                          Alert.alert('Could not send', 'Try again.');
                        });
                        return;
                      }
                      if (action.opensMarkPaid) {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setMarkPaidDrawerOpenForId(item.id);
                        setExpandedId(item.id);
                      }
                    }}
                    receiptNavigateMode={false}
                    onReceiptPress={() => router.push(`/receipt/${item.id}`)}
                    onJoinSplitPress={async (subscriptionId, inviteId) => {
                      if (!uid) return;
                      const trimmed = typeof inviteId === 'string' ? inviteId.trim() : '';
                      if (!trimmed) {
                        Alert.alert(
                          'Unable to join',
                          'This invite is missing its link. Open the invite from your notification or use the invite URL.',
                        );
                        return;
                      }
                      try {
                        await acceptPendingInvite(trimmed, uid);
                        void markActivityDocumentRead(uid, item.id).catch(() => {});
                        setLiveFeedItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
                        );
                        router.push({ pathname: '/subscription/[id]', params: { id: subscriptionId } });
                      } catch (e) {
                        Alert.alert('Could not join', e instanceof Error ? e.message : 'Try again.');
                      }
                    }}
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
  friendFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  friendFilterLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  friendFilterClear: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textDecorationLine: 'underline',
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
  body: {
    paddingHorizontal: 14,
    paddingTop: 16,
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
  receiptsEmpty: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  receiptsEmptyIcon: {
    marginBottom: 12,
    opacity: 0.85,
  },
  receiptsEmptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  receiptsEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.purple,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  receiptsEmptyCtaText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  actItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  actItemUnread: {
    borderLeftWidth: 3,
    borderLeftColor: C.purple,
    paddingLeft: 0,
  },
  actMain: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  actMainPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    minWidth: 0,
  },
  actLeft: {
    width: 40,
    alignItems: 'center',
  },
  actIcoPlain: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  joinSplitPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#EEEDFE',
  },
  joinSplitPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.purple,
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
    color: C.partialAmber,
  },
  partialTrack: {
    height: 4,
    backgroundColor: C.divider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  partialFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: C.partialAmber,
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
  drValPressable: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  drVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: C.text,
    textAlign: 'right',
    lineHeight: 18,
  },
  drValAmber: {
    color: C.partialAmber,
    fontWeight: '600',
  },
  drValLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.purple,
    textAlign: 'right',
    lineHeight: 18,
    textDecorationLine: 'underline',
    maxWidth: '100%',
  },
  actBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  actBtnExternalIcon: {
    marginTop: 1,
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
  markPaidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
    paddingVertical: 10,
    paddingHorizontal: 13,
    backgroundColor: '#FAFAF8',
  },
  markPaidInput: {
    flex: 1,
    backgroundColor: C.divider,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: C.text,
    minHeight: 42,
  },
  markPaidBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  markPaidBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
