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
import { subscribeActivityFeed } from '../../lib/activity/activityFeedFirestore';
import type { ActivityEvent } from '../../lib/activity/activityFeedSchema';
import { activityEventToFeedRow } from '../../lib/activity/activityEventToFeedItem';
import { sendPaymentReminderCallable } from '../../lib/activity/sendPaymentReminderCallable';

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
  /** Shows ↗ after label (e.g. open member activity). */
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
 * - `status` ↔ kind (e.g. partial, overdue, received)
 * - `partial_amount` ↔ partial.paid (amount received toward total)
 * - `amount` / total owed ↔ partial.total when partial
 * - `note` ↔ payerNote (optional message from payer)
 */
type ActivityFeedItem = {
  id: string;
  /** Profile → Activity: filter feed to items involving this friend id */
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
  /** Partial settlement: paid ↔ partial_amount, total ↔ amount due. */
  partial?: { paid: number; total: number };
  detail?: {
    rows: ActivityDetailRow[];
    actions?: ActivityDetailAction[];
  };
  /** Firestore `createdAt` (ms) for live feed grouping. */
  _activityCreatedAtMs?: number;
  _reminderTap?: { subscriptionId: string; memberUid: string };
  joinSubscriptionId?: string;
  serviceIconMuted?: boolean;
  friendAvatar?: { initials: string; imageUrl?: string | null };
};

type ActivityFeedGroup = { sectionTitle: string; items: ActivityFeedItem[] };

function itemMatchesFriend(item: ActivityFeedItem, friendId: string | null): boolean {
  if (!friendId) return true;
  const ids = item.friendLinkIds;
  return Boolean(ids?.includes(friendId));
}

function itemMatchesFilter(item: ActivityFeedItem, f: ActivityFilterId): boolean {
  if (f === 'all') return true;
  switch (f) {
    case 'received':
      return item.kind === 'received';
    case 'pending':
      return (
        item.kind === 'overdue' ||
        item.kind === 'partial' ||
        item.kind === 'reminder_received'
      );
    case 'failed':
      return item.kind === 'failed';
    case 'audit':
      return (
        item.kind === 'audit' ||
        item.kind === 'updated' ||
        item.kind === 'audit_join' ||
        item.kind === 'audit_reminder' ||
        item.kind === 'audit_ended' ||
        item.kind === 'split_invite_received' ||
        item.kind === 'split_invite_sent' ||
        item.kind === 'split_invite_accepted' ||
        item.kind === 'split_invite_declined' ||
        item.kind === 'split_member_joined' ||
        item.kind === 'split_member_removed' ||
        item.kind === 'split_ended' ||
        item.kind === 'split_restarted' ||
        item.kind === 'split_percentage_updated' ||
        item.kind === 'split_price_updated' ||
        item.kind === 'billing_cycle_complete' ||
        item.kind === 'billing_cycle_partial' ||
        item.kind === 'auto_charge_enabled' ||
        item.kind === 'auto_charge_disabled' ||
        item.kind === 'friend_connected' ||
        item.kind === 'friend_invite_accepted'
      );
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
        id: 't-you-netflix',
        kind: 'received',
        serviceMark: 'Netflix Premium',
        icon: 'checkmark',
        iconBg: '#E1F5EE',
        iconColor: '#1D9E75',
        title: 'You paid Netflix Premium',
        sub: 'Mar cycle · your share',
        time: 'Just now',
        amount: '$12.00',
        amountColor: '#1D9E75',
        badge: 'Paid',
        badgeVariant: 'green',
        detail: {
          rows: [
            { label: 'Subscription', value: 'Netflix Premium' },
            { label: 'Your share', value: '$12.00' },
            { label: 'Method', value: 'Charged to your card on file' },
          ],
        },
      },
      {
        id: 't1',
        friendLinkIds: ['alex'],
        kind: 'received',
        serviceMark: 'Spotify Family',
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
            { label: 'Stripe reference', value: 'pi_3Nx8aB···', link: true },
          ],
          actions: [
            { id: 't1-receipt', label: 'View receipt', variant: 'ghost' },
            { id: 't1-alex', label: 'All from Alex', variant: 'primary', external: true },
          ],
        },
      },
      {
        id: 't2',
        friendLinkIds: ['sam'],
        kind: 'overdue',
        serviceMark: 'Netflix Premium',
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
            { label: 'Reminders', value: '2 sent · last sent Mar 16' },
            { label: 'Subscription', value: 'Netflix Premium' },
          ],
          actions: [
            { id: 't2-mark', label: 'Mark paid manually', variant: 'ghost', opensMarkPaid: true },
            { id: 't2-remind', label: 'Send reminder', variant: 'primary' },
          ],
        },
      },
      {
        id: 't3',
        friendLinkIds: ['taylor'],
        kind: 'partial',
        serviceMark: 'iCloud',
        icon: 'checkmark-done-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: 'Taylor paid partial · iCloud',
        sub: 'Paid $1.25 of $2.50 · balance remaining',
        payerNote: 'Will send the rest Friday',
        time: '1 hr ago',
        amount: '+$1.25',
        amountColor: '#EF9F27',
        badge: 'Partial',
        badgeVariant: 'amber',
        partial: { paid: 1.25, total: 2.5 },
        detail: {
          rows: [
            { label: 'Paid so far', value: '$1.25' },
            { label: 'Remaining', value: '$1.25', valueAccent: 'amber' },
            { label: 'Note from payer', value: '"Will send the rest Friday"' },
          ],
          actions: [
            { id: 't3-remind', label: 'Remind for rest', variant: 'ghost' },
            { id: 't3-mark', label: 'Mark remainder paid', variant: 'primary', opensMarkPaid: true },
          ],
        },
      },
      {
        id: 't4',
        friendLinkIds: ['alex', 'sam'],
        kind: 'audit',
        serviceMark: 'Netflix Premium',
        icon: 'create-outline',
        iconBg: '#EEEDFE',
        iconColor: '#534AB7',
        title: 'Split percentages updated',
        sub: 'Netflix · changed by Titus · effective next cycle',
        time: '3 hrs ago',
        badge: 'Audit',
        badgeVariant: 'purple',
        amountColor: C.text,
        detail: {
          rows: [
            { label: 'Changed by', value: 'Titus (you)' },
            { label: 'Subscription', value: 'Netflix Premium' },
            { label: 'Titus', value: '33% → 40%' },
            { label: 'Alex', value: '33% → 30%' },
            { label: 'Sam', value: '34% → 30%' },
            { label: 'Effective date', value: 'Next cycle · Apr 18' },
          ],
        },
      },
      {
        id: 't-audit-remind',
        friendLinkIds: ['sam'],
        kind: 'audit_reminder',
        serviceMark: 'Netflix Premium',
        icon: 'notifications-outline',
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        title: 'Auto-reminder sent to Sam',
        sub: 'Netflix · $5.33 overdue · system-triggered',
        time: 'Today · 9:00 AM',
        amount: '$5.33',
        amountColor: '#EF9F27',
        badge: 'Reminder',
        badgeVariant: 'amber',
        detail: {
          rows: [
            { label: 'Subscription', value: 'Netflix Premium' },
            { label: 'Amount', value: '$5.33 owed' },
            { label: 'Trigger', value: 'System · overdue threshold' },
            { label: 'Channel', value: 'Push notification' },
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
        friendLinkIds: ['taylor'],
        kind: 'received',
        serviceMark: 'Xbox Game Pass',
        icon: 'checkmark',
        iconBg: '#E1F5EE',
        iconColor: '#1D9E75',
        title: 'Taylor paid Xbox Game Pass',
        sub: 'Mar cycle · marked manually',
        payerNote: 'Sent via Venmo @taylor_r',
        time: 'Mar 15 · 4:22 PM',
        amount: '+$7.50',
        amountColor: '#1D9E75',
        badge: 'Received',
        badgeVariant: 'green',
        detail: {
          rows: [
            { label: 'From', value: 'Taylor R. · manual payment' },
            { label: 'For', value: 'Xbox Game Pass — March' },
            { label: 'Method', value: 'Marked paid manually' },
          ],
          actions: [
            { id: 'y1-receipt', label: 'View receipt', variant: 'ghost' },
            { id: 'y1-taylor', label: 'All from Taylor', variant: 'primary', external: true },
          ],
        },
      },
      {
        id: 'y2',
        friendLinkIds: ['sam'],
        kind: 'failed',
        serviceMark: 'Hulu',
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
            { label: 'Failure reason', value: 'Card declined' },
            { label: 'Retry', value: 'Attempt 2 of 4 · next retry in 2 days' },
            { label: 'Stripe error reference', value: 'pi_err_3Nx···', link: true },
          ],
          actions: [
            { id: 'y2-msg', label: 'Message Sam', variant: 'ghost' },
            { id: 'y2-retry', label: 'Retry now', variant: 'danger' },
          ],
        },
      },
      {
        id: 'y3',
        friendLinkIds: ['alex', 'sam', 'taylor'],
        kind: 'updated',
        serviceMark: 'Netflix',
        icon: 'information-circle-outline',
        iconBg: '#E6F1FB',
        iconColor: '#185FA5',
        title: 'Netflix price updated',
        sub: '$19.99 → $22.99 · updated by Titus · group notified',
        time: 'Mar 15 · 8:00 AM',
        badge: 'Updated',
        badgeVariant: 'gray',
        amountColor: C.text,
        detail: {
          rows: [
            { label: 'Updated by', value: 'Titus (you)' },
            { label: 'Old price', value: '$19.99/month' },
            { label: 'New price', value: '$22.99/month' },
            { label: 'Effective', value: 'Next cycle only' },
            { label: 'Group notified', value: '3 members via push' },
          ],
        },
      },
    ],
  },
  {
    sectionTitle: 'Mar 14',
    items: [
      {
        id: 'm-ended',
        kind: 'audit_ended',
        serviceMark: 'Hulu',
        icon: 'close-circle-outline',
        iconBg: '#F0EEE9',
        iconColor: '#5F5E5A',
        title: 'Hulu split ended',
        sub: 'Ended by Titus · billing stopped · history saved',
        time: 'Mar 14 · 8:00 AM',
        badge: 'Ended',
        badgeVariant: 'gray',
        amountColor: C.text,
        detail: {
          rows: [
            { label: 'Subscription', value: 'Hulu (ad-free)' },
            { label: 'Ended by', value: 'Titus (you)' },
            { label: 'History', value: 'Retained · read-only audit trail' },
          ],
        },
      },
      {
        id: 'm-join',
        friendLinkIds: ['sam'],
        kind: 'audit_join',
        serviceMark: 'Netflix Premium',
        icon: 'person-add-outline',
        iconBg: '#E1F5EE',
        iconColor: '#0F6E56',
        title: 'Sam joined Netflix split',
        sub: 'Invited by Titus · payment method added',
        time: 'Mar 14 · 10:12 AM',
        badge: 'Joined',
        badgeVariant: 'green',
        amountColor: C.text,
        detail: {
          rows: [
            { label: 'Member', value: 'Sam M.' },
            { label: 'Invited by', value: 'Titus (you)' },
            { label: 'Payment method', value: 'Visa ···· 4242' },
          ],
        },
      },
      {
        id: 'm1',
        friendLinkIds: ['alex', 'casey'],
        kind: 'receipt',
        serviceMark: 'Olive Garden',
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
          actions: [{ id: 'm1-open', label: 'Open receipt', variant: 'primary' }],
        },
      },
      {
        id: 'm2',
        kind: 'receipt',
        serviceMark: 'Chipotle',
        icon: 'receipt-outline',
        iconBg: '#EEEDFE',
        iconColor: '#534AB7',
        title: 'Chipotle',
        sub: '2 people · 4 items · Settled',
        time: 'Mar 14',
        amount: '$24.80',
        amountColor: C.text,
        badge: 'Settled',
        badgeVariant: 'green',
      },
    ],
  },
];

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function groupLiveItemsBySection(items: ActivityFeedItem[]): ActivityFeedGroup[] {
  const today = startOfDayLocal(new Date()).getTime();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = startOfDayLocal(y).getTime();

  const todayItems: ActivityFeedItem[] = [];
  const yesterdayItems: ActivityFeedItem[] = [];
  const older = new Map<string, ActivityFeedItem[]>();

  for (const item of items) {
    const ms = item._activityCreatedAtMs;
    if (ms == null) continue;
    const d = new Date(ms);
    const ds = startOfDayLocal(d).getTime();
    if (ds === today) todayItems.push(item);
    else if (ds === yesterday) yesterdayItems.push(item);
    else {
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const arr = older.get(label) ?? [];
      arr.push(item);
      older.set(label, arr);
    }
  }

  const groups: ActivityFeedGroup[] = [];
  if (todayItems.length) groups.push({ sectionTitle: 'Today', items: todayItems });
  if (yesterdayItems.length) groups.push({ sectionTitle: 'Yesterday', items: yesterdayItems });
  const olderSorted = Array.from(older.entries()).sort((a, b) => {
    const ma = a[1][0]?._activityCreatedAtMs ?? 0;
    const mb = b[1][0]?._activityCreatedAtMs ?? 0;
    return mb - ma;
  });
  for (const [title, its] of olderSorted) {
    groups.push({ sectionTitle: title, items: its });
  }
  return groups;
}

function findBaseActivityItem(
  itemId: string,
  liveItems: ActivityFeedItem[],
): ActivityFeedItem | undefined {
  const live = liveItems.find((i) => i.id === itemId);
  if (live) return live;
  for (const g of MOCK_ACTIVITY_GROUPS) {
    const found = g.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
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
  if (f === 'pending') return true;
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
  /** Split invite row: open subscription to join. */
  onJoinSplitPress?: (subscriptionId: string) => void;
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
}: ActivityItemRowProps) {
  const b = badgeStyles(item.badgeVariant);
  const receiptTapOpensDetail = receiptNavigateMode && item.kind === 'receipt';
  const hasExpandableDetail = Boolean(
    !receiptTapOpensDetail &&
      item.detail &&
      (item.detail.rows.length > 0 || (item.detail.actions?.length ?? 0) > 0),
  );

  const onMainPress = () => {
    if (receiptTapOpensDetail) onReceiptPress();
    else if (hasExpandableDetail) onToggle();
  };

  const rowPressable =
    receiptTapOpensDetail || hasExpandableDetail ? onMainPress : undefined;

  return (
    <View style={styles.actItem}>
      <View style={styles.actMain}>
        <Pressable
          onPress={rowPressable}
          style={styles.actMainPressable}
          accessibilityRole={receiptTapOpensDetail || hasExpandableDetail ? 'button' : 'none'}
          accessibilityLabel={receiptTapOpensDetail ? `Open receipt ${item.title}` : undefined}
          accessibilityState={hasExpandableDetail ? { expanded } : undefined}
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
              onPress={() => onJoinSplitPress(item.joinSubscriptionId!)}
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
    if (f === 'receipts') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(null);
      setMarkPaidDrawerOpenForId(null);
      setFilter('receipts');
    } else if (f === 'all') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(null);
      setMarkPaidDrawerOpenForId(null);
      setFilter('all');
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
        if (row) rows.push(row as ActivityFeedItem);
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
    /** Receipts filter still uses demo rows until receipt splits write to `users/{uid}/activity`. */
    const useMockOnly = filter === 'receipts';

    if (useMockOnly) {
      const groups = MOCK_ACTIVITY_GROUPS.map((g) => ({
        ...g,
        items: g.items
          .map((i) =>
            manualPaidByItemId[i.id]
              ? applyManualPaidToItem(i, manualPaidByItemId[i.id]!)
              : i,
          )
          .filter((i) => itemMatchesFilter(i, filter) && itemMatchesFriend(i, friendIdFilter)),
      })).filter((g) => g.items.length > 0);

      if (filter === 'receipts' && groups.length > 0) {
        return [
          {
            sectionTitle: 'Receipt splits',
            items: groups.flatMap((g) => g.items),
          },
        ];
      }

      return groups;
    }

    const liveFiltered = liveFeedItems.filter(
      (i) => itemMatchesFilter(i, filter) && itemMatchesFriend(i, friendIdFilter),
    );
    const grouped = groupLiveItemsBySection(liveFiltered);
    if (filter === 'audit' && grouped.length > 0) {
      return [
        {
          sectionTitle: 'All changes',
          items: grouped.flatMap((g) => g.items),
        },
      ];
    }
    return grouped;
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
            filter === 'receipts' ? (
              <View style={styles.receiptsEmpty}>
                <Ionicons name="receipt-outline" size={40} color={C.muted} style={styles.receiptsEmptyIcon} />
                <Text style={styles.receiptsEmptyTitle}>No receipts yet · Scan your first receipt</Text>
                <Pressable
                  style={styles.receiptsEmptyCta}
                  onPress={() => router.push('/scan')}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Scan tab"
                >
                  <Ionicons name="scan-outline" size={20} color="#fff" />
                  <Text style={styles.receiptsEmptyCtaText}>Scan receipt</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.feedEmpty}>
                <Text style={styles.feedEmptyText}>
                  {friendIdFilter
                    ? `No activity with ${getFriendFilterDisplayName(friendIdFilter)} yet.`
                    : filter === 'audit'
                      ? 'No subscription changes or audit events yet.'
                      : 'No activity for this filter.'}
                </Text>
              </View>
            )
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
                    expanded={expandedId === item.id}
                    onToggle={() => toggleExpanded(item.id)}
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
                    receiptNavigateMode={filter === 'receipts'}
                    onReceiptPress={() => router.push(`/receipt/${item.id}`)}
                    onJoinSplitPress={(subscriptionId) =>
                      router.push({ pathname: '/subscription/[id]', params: { id: subscriptionId } })
                    }
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
