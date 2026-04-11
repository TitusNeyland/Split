import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Animated,
  BackHandler,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { getFriendFilterDisplayName } from '../../lib/profile';
import { ServiceIcon } from '../../components/shared/ServiceIcon';
import { UserAvatarCircle } from '../../components/shared/UserAvatarCircle';
import { recordManualSettlement } from '../../lib/payment/paymentsFirestore';
import { useFirebaseUid } from '../../lib/auth/useFirebaseUid';
import { doc, getDoc } from 'firebase/firestore';
import {
  markActivityDocumentRead,
  subscribeActivityFeed,
  updateActivityDocumentStatus,
} from '../../lib/activity/activityFeedFirestore';
import type { ActivityEvent, ActivityEventType } from '../../lib/activity/activityFeedSchema';
import { filterActivityEventsForFeed } from '../../lib/activity/activityStaleSubscription';
import {
  collectInvalidSubscriptionIds,
  markActivityDocsSubscriptionDeleted,
} from '../../lib/activity/validateActivitySubscriptions';
import { getFirebaseFirestore, getFirebaseAuth } from '../../lib/firebase';
import { activityEventToFeedRow } from '../../lib/activity/activityEventToFeedItem';
import {
  activityEventMatchesFilter,
  type ActivityFilterTabId,
} from '../../lib/activity/activityFilters';
import { resolveActivityRoute } from '../../lib/activity/activityNavigation';
import { sendPaymentReminderCallable } from '../../lib/activity/sendPaymentReminderCallable';
import { acceptPendingInvite } from '../../lib/friends/friendSystemFirestore';
import { mergeSplitInviteAcceptance, markSplitInviteNotificationAcceptedBySubscription } from '../../lib/home/homeNotificationsFirestore';
import { replaceWithSplitJoinedCelebration } from '../../lib/navigation/splitJoinedCelebration';
import { formatUsdFromCents, formatUsdDollarsFixed2 } from '../../lib/format/currency';
import { computeActivityOwnerSummaryStats } from '../../lib/activity/activityOwnerSummaryStats';
import { ActivityBadge } from '../../components/ActivityBadge';
import { getActivityBadgeVariantForFeedItem } from '../../lib/activity/activityBadgeSemantics';
import { useSubscriptions } from '../../contexts/SubscriptionsContext';
import type { MemberSubscriptionDoc } from '../../lib/subscription/memberSubscriptionsFirestore';
import { useHomeFriendDirectory } from '../../lib/home/useFriendUidsFromFirestore';

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

const HERO_STAT_SKELETON = '#E5E2DC';

/** Gray pulsing bar — matches profile stat cards while subscriptions load. */
function HeroStatValueSkeleton({ style }: { style?: ViewStyle }) {
  const op = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.95, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <Animated.View
      style={[style, { backgroundColor: HERO_STAT_SKELETON, opacity: op }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

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
  | 'split_invite_declined_owner'
  | 'split_invite_expired'
  | 'split_member_joined'
  | 'split_member_removed'
  | 'split_left'
  | 'split_member_left'
  | 'split_ended'
  | 'split_percentage_updated'
  | 'split_price_updated'
  | 'friend_connected'
  | 'friend_invite_accepted'
  | 'billing_cycle_complete'
  | 'billing_cycle_partial'
  | 'auto_charge_enabled'
  | 'auto_charge_disabled';

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
      ? `+${formatUsdDollarsFixed2(item.partial.total)}`
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
  /** Catalog preset id when present on the activity event (matches `services/{id}`). */
  serviceId?: string;
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
  /** Raw cents from Firestore `amount` when present (subscription detail prefill). */
  amountCents?: number;
  amountColor: string;
  badge: string;
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
  /** For split_invite_received: mirrors the activity doc status field so the card reflects the current state. */
  inviteStatus?: string;
  friendAvatar?: { initials: string; imageUrl?: string | null; uid?: string };
  /** Raw Firestore event type — drives filter tabs. */
  activityType: ActivityEventType;
  /** Server + optimistic client read state */
  read?: boolean;
  subscriptionId?: string;
  /** When false, do not navigate to `/subscription/[id]` from this row. */
  navigateToSubscription?: boolean;
};

type ActivityFeedGroup = { sectionTitle: string; items: ActivityFeedItem[] };

/** When the subscription is not in the local subscriptions list, pass row hints so detail can render before Firestore. */
function buildSubscriptionPrefillParam(
  item: ActivityFeedItem,
  subId: string,
  subscriptions: MemberSubscriptionDoc[]
): Record<string, string | number | boolean> | null {
  const doc = subscriptions.find((s) => s.id === subId);
  if (doc) return null;
  const name = item.serviceMark?.trim() || 'Subscription';
  const totalCents =
    typeof item.amountCents === 'number' && Number.isFinite(item.amountCents) ? Math.round(item.amountCents) : 0;
  const out: Record<string, string | number | boolean> = { name, totalCents, isOwner: false };
  if (item.serviceId) out.serviceId = item.serviceId;
  return out;
}

function itemMatchesFriend(item: ActivityFeedItem, friendId: string | null): boolean {
  if (!friendId) return true;
  const ids = item.friendLinkIds;
  return Boolean(ids?.includes(friendId));
}

function itemMatchesFilter(item: ActivityFeedItem, f: ActivityFilterId): boolean {
  return activityEventMatchesFilter(f, item.activityType);
}

/** Real-time activity search: title, sub, amounts, type, badge, detail rows. */
function itemMatchesSearch(item: ActivityFeedItem, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  const parts: string[] = [
    item.title,
    item.sub,
    item.serviceMark ?? '',
    item.amount ?? '',
    item.badge ?? '',
    String(item.activityType ?? ''),
    item.kind,
    item.payerNote ?? '',
    item.friendAvatar?.initials ?? '',
  ];
  for (const row of item.detail?.rows ?? []) {
    parts.push(row.label, row.value);
  }
  const blob = parts.join(' ').toLowerCase();
  if (blob.includes(q)) return true;
  const qDigits = q.replace(/\D/g, '');
  if (qDigits.length >= 1) {
    const amtDigits = (item.amount ?? '').replace(/\D/g, '');
    if (amtDigits.includes(qDigits)) return true;
  }
  return false;
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
                  uid={item.friendAvatar.uid}
                  initials={item.friendAvatar.initials}
                  imageUrl={item.friendAvatar.imageUrl}
                />
              </View>
            ) : item.serviceMark ? (
              <View style={styles.actIcoPlain}>
                <ServiceIcon serviceName={item.serviceMark} serviceId={item.serviceId} size={40} />
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
          {item.joinSubscriptionId && onJoinSplitPress && item.inviteStatus !== 'accepted' && item.inviteStatus !== 'declined' ? (
            <Pressable
              onPress={() => onJoinSplitPress(item.joinSubscriptionId!, item.joinInviteId)}
              style={styles.joinSplitPill}
              accessibilityRole="button"
              accessibilityLabel="Join split"
            >
              <Text style={styles.joinSplitPillText}>Join</Text>
            </Pressable>
          ) : item.inviteStatus === 'accepted' ? (
            <View style={styles.inviteStatusRow}>
              <Ionicons name="checkmark-circle" size={13} color="#1D9E75" />
              <Text style={styles.inviteStatusTextAccepted}>Joined</Text>
            </View>
          ) : item.inviteStatus === 'declined' ? (
            <View style={styles.inviteStatusRow}>
              <Ionicons name="close-circle" size={13} color="#888780" />
              <Text style={styles.inviteStatusTextDeclined}>Declined</Text>
            </View>
          ) : (
            <ActivityBadge
              variant={getActivityBadgeVariantForFeedItem({
                activityType: item.activityType,
                kind: item.kind,
                badge: item.badge,
              })}
              label={item.badge}
            />
          )}
        </View>
      </View>

      {item.partial ? (
        <View style={styles.partialWrap}>
          <View style={styles.partialLabelRow}>
            <Text style={styles.partialLbl}>
              {formatUsdDollarsFixed2(item.partial.paid)} of {formatUsdDollarsFixed2(item.partial.total)} paid
            </Text>
            <Text style={styles.partialAmt}>
              {formatUsdDollarsFixed2(item.partial.total - item.partial.paid)} remaining
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
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const uid = useFirebaseUid();
  const { displayNameByUid } = useHomeFriendDirectory(uid);
  const { subscriptions, loading: subscriptionsLoading, owedToYouCents } = useSubscriptions();
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
  const [rawActivityEvents, setRawActivityEvents] = useState<ActivityEvent[]>([]);
  /** Local overlay until Firestore listener includes `subscriptionDeleted` from CF or batch writes. */
  const [activityEventPatches, setActivityEventPatches] = useState<
    Record<string, { subscriptionDeleted?: boolean }>
  >({});
  /** Optimistic read state before the activity snapshot reflects `read: true`. */
  const [readOptimisticById, setReadOptimisticById] = useState<Record<string, boolean>>({});
  /** Optimistically hides the Join button by subscriptionId — stable across Cloud Function rewrites of the activity event. */
  const [joinedSubscriptionIds, setJoinedSubscriptionIds] = useState<Set<string>>(new Set());
  const lastSubscriptionValidateAtRef = useRef(0);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

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

  const dismissSearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchActive(false);
    setSearchQuery('');
    searchInputRef.current?.blur();
  }, []);

  useEffect(() => {
    if (!searchActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissSearch();
      return true;
    });
    return () => sub.remove();
  }, [searchActive, dismissSearch]);

  useEffect(() => {
    if (!searchActive) return;
    const t = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [searchActive]);

  useEffect(() => {
    if (!uid) {
      setRawActivityEvents([]);
      return;
    }
    const unsub = subscribeActivityFeed(uid, (events) => {
      setRawActivityEvents(events);
    });
    return unsub;
  }, [uid]);

  const mergedActivityEvents = useMemo(() => {
    return rawActivityEvents.map((e) => ({
      ...e,
      ...activityEventPatches[e.id],
    }));
  }, [rawActivityEvents, activityEventPatches]);

  const visibleActivityEvents = useMemo(
    () => filterActivityEventsForFeed(mergedActivityEvents),
    [mergedActivityEvents]
  );

  const liveFeedItems = useMemo(() => {
    const rows: ActivityFeedItem[] = [];
    for (const e of visibleActivityEvents) {
      const row = activityEventToFeedRow(e as ActivityEvent, uid);
      if (!row) continue;
      rows.push({
        ...row,
        activityType: e.type,
        read: e.read === true || readOptimisticById[e.id] === true,
        subscriptionId: e.subscriptionId,
        amountCents: typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : undefined,
        inviteStatus: typeof e.status === 'string' && e.status ? e.status : undefined,
      } as ActivityFeedItem);
    }
    return rows;
  }, [visibleActivityEvents, uid, readOptimisticById]);

  const rawActivityEventsRef = useRef(rawActivityEvents);
  rawActivityEventsRef.current = rawActivityEvents;
  const activityEventPatchesRef = useRef(activityEventPatches);
  activityEventPatchesRef.current = activityEventPatches;

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      const now = Date.now();
      if (now - lastSubscriptionValidateAtRef.current < 60_000) return;
      lastSubscriptionValidateAtRef.current = now;

      void (async () => {
        const merged = rawActivityEventsRef.current.map((e) => ({
          ...e,
          ...activityEventPatchesRef.current[e.id],
        }));
        let invalidSubscriptionIds: Set<string> = new Set();
        try {
          const result = await collectInvalidSubscriptionIds(merged);
          invalidSubscriptionIds = result.invalidSubscriptionIds;
        } catch (error) {
          // Log but don't crash if subscription validation fails. Some subscriptions may be
          // inaccessible due to permission constraints when user is no longer a member.
          console.error('Failed to collect invalid subscriptions:', error);
        }
        if (invalidSubscriptionIds.size === 0) return;

        setActivityEventPatches((prev) => {
          const next = { ...prev };
          for (const e of merged) {
            if (e.subscriptionId && invalidSubscriptionIds.has(e.subscriptionId)) {
              next[e.id] = { ...next[e.id], subscriptionDeleted: true };
            }
          }
          return next;
        });

        try {
          await markActivityDocsSubscriptionDeleted(uid, [...invalidSubscriptionIds]);
        } catch {
          /* Local patches still apply. */
        }
      })();
    }, [uid])
  );

  const ownerSummary = useMemo(
    () => computeActivityOwnerSummaryStats(subscriptions, uid ?? '', new Date()),
    [subscriptions, uid],
  );

  const statsLoading = Boolean(uid && subscriptionsLoading);

  const collectedDisplay = useMemo(() => {
    const cents = ownerSummary.collectedThisMonthCents;
    const formatted = formatUsdFromCents(cents);
    if (cents === 0) return formatted;
    return `+${formatted}`;
  }, [ownerSummary.collectedThisMonthCents]);

  const pendingDisplay = useMemo(() => formatUsdFromCents(owedToYouCents), [owedToYouCents]);

  const pendingBreakdown = useMemo(() => {
    const { pendingOverdueCount: o, pendingOnlyCount: p } = ownerSummary;
    if (o + p === 0) return '';
    return `${o} overdue · ${p} pending`;
  }, [ownerSummary]);

  const feedItemsAfterPills = useMemo(() => {
    const mapped = liveFeedItems.map((i) =>
      manualPaidByItemId[i.id] ? applyManualPaidToItem(i, manualPaidByItemId[i.id]!) : i,
    );
    return mapped.filter(
      (i) => itemMatchesFilter(i, filter) && itemMatchesFriend(i, friendIdFilter),
    );
  }, [filter, manualPaidByItemId, friendIdFilter, liveFeedItems]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const liveFiltered = q
      ? feedItemsAfterPills.filter((i) => itemMatchesSearch(i, q))
      : feedItemsAfterPills;
    return groupLiveItemsBySection(liveFiltered);
  }, [feedItemsAfterPills, searchQuery]);

  const searchNoResults =
    Boolean(searchQuery.trim()) && feedItemsAfterPills.length > 0 && filteredGroups.length === 0;

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
    async (item: ActivityFeedItem) => {
      if (uid) {
        void markActivityDocumentRead(uid, item.id).catch(() => {});
        setReadOptimisticById((prev) => ({ ...prev, [item.id]: true }));
      }
      const path = resolveActivityRoute({
        activityType: item.activityType,
        subscriptionId: item.subscriptionId,
        joinSubscriptionId: item.joinSubscriptionId,
        friendLinkIds: item.friendLinkIds,
        navigateToSubscription: item.navigateToSubscription,
      });
      if (path) {
        if (path.startsWith('/subscription/')) {
          const subId = path.slice('/subscription/'.length);
          const db = getFirebaseFirestore();
          if (db) {
            const snap = await getDoc(doc(db, 'subscriptions', subId));
            const st = snap.exists()
              ? String((snap.data() as { status?: string }).status ?? 'active').toLowerCase()
              : '';
            if (!snap.exists() || st !== 'active') {
              setActivityEventPatches((prev) => ({
                ...prev,
                [item.id]: { ...prev[item.id], subscriptionDeleted: true },
              }));
              Alert.alert('This split no longer exists.');
              if (uid) {
                try {
                  await markActivityDocsSubscriptionDeleted(uid, [subId]);
                } catch {
                  /* ignore */
                }
              }
              return;
            }
          }
          const prefill = buildSubscriptionPrefillParam(item, subId, subscriptions);
          router.push({
            pathname: '/subscription/[id]',
            params: {
              id: subId,
              ...(prefill ? { prefillData: JSON.stringify(prefill) } : {}),
            },
          } as never);
          return;
        }
        router.push(path as never);
        return;
      }
      const friendFilterUid =
        (item.activityType === 'friend_connected' || item.activityType === 'friend_invite_accepted') &&
        item.friendLinkIds?.[0]
          ? item.friendLinkIds[0]
          : null;
      if (friendFilterUid) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        router.setParams({ friendId: friendFilterUid });
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
    [uid, router, subscriptions],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        ref={scrollRef}
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
          {searchActive ? (
            <View style={styles.searchHeroRow}>
              <Ionicons name="search-outline" size={20} color="rgba(255,255,255,0.55)" style={styles.searchHeroIcon} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search activity…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search activity"
              />
              <Pressable
                hitSlop={8}
                onPress={dismissSearch}
                accessibilityRole="button"
                accessibilityLabel="Dismiss search"
              >
                <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.45)" />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={dismissSearch}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
              >
                <Text style={styles.searchCancel}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.sbar}>
              <Text style={styles.pageTitle}>Activity</Text>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Search activity"
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSearchActive(true);
                }}
              >
                <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
          )}

          {friendIdFilter ? (
            <View style={styles.friendFilterBar}>
              <Text style={styles.friendFilterLabel} numberOfLines={1}>
                With {getFriendFilterDisplayName(friendIdFilter, displayNameByUid)}
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
              {statsLoading ? (
                <HeroStatValueSkeleton style={styles.heroStatSkeleton} />
              ) : (
                <Text
                  style={styles.hstatValGreen}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {collectedDisplay}
                </Text>
              )}
              <Text style={styles.hstatLbl} numberOfLines={1}>
                Collected this month
              </Text>
            </View>
            <View style={styles.hstat}>
              {statsLoading ? (
                <HeroStatValueSkeleton style={styles.heroStatSkeleton} />
              ) : (
                <Text
                  style={styles.hstatValWhite}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {pendingDisplay}
                </Text>
              )}
              <Text style={styles.hstatLbl} numberOfLines={1}>
                Pending payments
              </Text>
              {pendingBreakdown ? (
                <Text style={styles.hstatSubAmber}>{pendingBreakdown}</Text>
              ) : null}
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
          {searchNoResults ? (
            <View style={styles.feedEmpty}>
              <View style={styles.searchEmptyIconWrap}>
                <Ionicons name="search-outline" size={40} color={C.muted} />
              </View>
              <Text style={styles.feedEmptyText}>
                {`No activity matching "${searchQuery.trim()}"`}
              </Text>
              <Pressable
                style={styles.searchClearBtn}
                onPress={dismissSearch}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Text style={styles.searchClearBtnTxt}>Clear search</Text>
              </Pressable>
            </View>
          ) : filteredGroups.length === 0 ? (
            <View style={styles.feedEmpty}>
              <Text style={styles.feedEmptyText}>
                {friendIdFilter
                  ? `No activity with ${getFriendFilterDisplayName(friendIdFilter, displayNameByUid)} yet.`
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
                    onJoinSplitPress={joinedSubscriptionIds.has(item.joinSubscriptionId ?? '') ? undefined : async (subscriptionId, inviteId) => {
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
                        // Secondary guard: check live membership before attempting to accept.
                        const db = getFirebaseFirestore();
                        if (db) {
                          const subSnap = await getDoc(doc(db, 'subscriptions', subscriptionId));
                          if (!subSnap.exists()) {
                            void updateActivityDocumentStatus(uid, item.id, 'cancelled').catch(() => {});
                            Alert.alert('Split no longer exists', 'This split has been removed.');
                            return;
                          }
                          const subData = subSnap.data() as Record<string, unknown>;
                          const members = Array.isArray(subData.members) ? subData.members as Record<string, unknown>[] : [];
                          const member = members.find((m) => String(m.uid ?? '') === uid);
                          if (member && String(member.memberStatus ?? '') === 'active') {
                            // Already a member — silently correct the card without an error.
                            void updateActivityDocumentStatus(uid, item.id, 'accepted').catch(() => {});
                            void markActivityDocumentRead(uid, item.id).catch(() => {});
                            return;
                          }
                          if (member && String(member.memberStatus ?? '') !== 'pending') {
                            void updateActivityDocumentStatus(uid, item.id, 'cancelled').catch(() => {});
                            Alert.alert('Invite no longer valid', 'This invite may have expired or been cancelled.');
                            return;
                          }
                        }
                        setJoinedSubscriptionIds((prev) => new Set([...prev, subscriptionId]));
                        try {
                          await acceptPendingInvite(trimmed, uid);
                        } catch (e) {
                          setJoinedSubscriptionIds((prev) => {
                            const next = new Set(prev);
                            next.delete(subscriptionId);
                            return next;
                          });
                          Alert.alert('Could not join', e instanceof Error ? e.message : 'Try again.');
                          return;
                        }
                        const displayName = getFirebaseAuth()?.currentUser?.displayName ?? '';
                        void mergeSplitInviteAcceptance({ uid, displayName, subscriptionId, inviteId: trimmed }).catch(() => {});
                        void markSplitInviteNotificationAcceptedBySubscription(uid, subscriptionId).catch(() => {});
                        void updateActivityDocumentStatus(uid, item.id, 'accepted').catch(() => {});
                        void markActivityDocumentRead(uid, item.id).catch(() => {});
                        setReadOptimisticById((prev) => ({ ...prev, [item.id]: true }));
                        const ok = await replaceWithSplitJoinedCelebration(router, subscriptionId, uid);
                        if (!ok) {
                          router.replace({ pathname: '/subscription/[id]', params: { id: subscriptionId } });
                        }
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
  searchHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
    minHeight: 44,
  },
  searchHeroIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '500',
    color: '#fff',
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    paddingHorizontal: 0,
  },
  searchCancel: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  searchEmptyIconWrap: {
    marginBottom: 12,
    opacity: 0.85,
  },
  searchClearBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(83,74,183,0.12)',
  },
  searchClearBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.purple,
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
    minWidth: 0,
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
    color: '#22c55e',
    marginBottom: 4,
    letterSpacing: -0.5,
    width: '100%',
  },
  hstatValWhite: {
    fontSize: 30,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: -0.5,
    width: '100%',
  },
  heroStatSkeleton: {
    height: 34,
    width: 128,
    borderRadius: 10,
    marginBottom: 4,
    maxWidth: '100%',
  },
  hstatLbl: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
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
  inviteStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inviteStatusTextAccepted: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D9E75',
  },
  inviteStatusTextDeclined: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888780',
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
    fontSize: 11,
    color: C.muted,
    flexShrink: 0,
    lineHeight: 15,
  },
  drValPressable: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  drVal: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: C.text,
    textAlign: 'right',
    lineHeight: 15,
  },
  drValAmber: {
    color: C.partialAmber,
    fontWeight: '600',
  },
  drValLinkText: {
    fontSize: 11,
    fontWeight: '500',
    color: C.purple,
    textAlign: 'right',
    lineHeight: 15,
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
