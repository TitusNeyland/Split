import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../shared/ServiceIcon';
import {
  getOwnerId,
  normalizeSubscriptionStatus,
} from '../../lib/subscription/subscriptionToCardModel';
import { getMemberPaymentStatusNormalized } from '../../lib/subscription/subscriptionDerivedMetrics';
import { getMemberAmountCents } from '../../lib/subscription/memberAmount';
import { formatUsdFromCents } from '../../lib/format/currency';
import { markSubscriptionMemberPaid } from '../../lib/payment/markSubscriptionMemberPaid';
import type { MemberSubscriptionDoc } from '../../lib/subscription/memberSubscriptionsFirestore';

const C = {
  bg: '#F2F0EB',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  green: '#1D9E75',
  greenLight: '#E1F5EE',
  greenDark: '#0F6E56',
  handle: '#D3D1C7',
  amberBg: '#FAEEDA',
  amberText: '#854F0B',
  red: '#E24B4A',
  redLight: '#FCEBEB',
  white: '#fff',
};

type PaymentMethod = 'cash' | 'venmo' | 'other';

const METHODS: { id: PaymentMethod; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'venmo', label: 'Venmo', icon: 'phone-portrait-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

type PendingRow = {
  subId: string;
  serviceName: string;
  serviceId?: string;
  subName: string;
  ownerName: string;
  amountCents: number;
  isOverdue: boolean;
};

export type HomePayNowSheetProps = {
  visible: boolean;
  onClose: () => void;
  subscriptions: MemberSubscriptionDoc[];
  currentUid: string;
};

function slideDistance(windowH: number): number {
  return Math.min(windowH * 0.55, 500);
}

export function HomePayNowSheet({
  visible,
  onClose,
  subscriptions,
  currentUid,
}: HomePayNowSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxSheetH = Math.min(windowH * 0.92, 700);

  const translateY = useRef(new Animated.Value(slideDistance(windowH))).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  const [selectedRow, setSelectedRow] = useState<PendingRow | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [confirming, setConfirming] = useState(false);

  const dismiss = useCallback(() => {
    if (confirming) return;
    const dist = slideDistance(windowH);
    Animated.parallel([
      Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: dist, duration: 240, useNativeDriver: true }),
    ]).start(() => {
      setSelectedRow(null);
      setMethod('cash');
      onClose();
    });
  }, [confirming, onClose, backdropOp, translateY, windowH]);

  useLayoutEffect(() => {
    if (!visible) {
      translateY.setValue(slideDistance(windowH));
      backdropOp.setValue(0);
      return;
    }
    const dist = slideDistance(windowH);
    translateY.setValue(dist);
    backdropOp.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOp, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 220,
        mass: 0.85,
      }),
    ]).start();
  }, [visible, windowH, translateY, backdropOp]);

  const pendingRows = useMemo((): PendingRow[] => {
    if (!currentUid) return [];
    return subscriptions
      .filter((docItem) => {
        const sub = docItem as Record<string, unknown>;
        if (normalizeSubscriptionStatus(sub.status) !== 'active') return false;
        if (getOwnerId(sub) === currentUid) return false;
        const st = getMemberPaymentStatusNormalized(sub, currentUid);
        // Include pending, overdue, and uninitialized ('') — any status except already paid/owner/uninvited.
        // '' means payment status was never written after invite acceptance; treat as unpaid.
        return st !== 'paid' && st !== 'owner' && st !== 'invited_pending';
      })
      .map((docItem) => {
        const sub = docItem as Record<string, unknown>;
        const serviceName =
          typeof sub.serviceName === 'string' ? sub.serviceName.trim() : '';
        const planName =
          typeof sub.planName === 'string' ? sub.planName.trim() : '';
        const subName = serviceName || planName || 'Subscription';
        const serviceId =
          typeof sub.serviceId === 'string' && sub.serviceId.trim()
            ? sub.serviceId.trim()
            : undefined;
        const ownerName =
          typeof sub.payerDisplay === 'string' && sub.payerDisplay.trim()
            ? sub.payerDisplay.trim()
            : 'Owner';
        const amountCents = getMemberAmountCents(sub, currentUid);
        const isOverdue = getMemberPaymentStatusNormalized(sub, currentUid) === 'overdue';
        return {
          subId: docItem.id,
          serviceName,
          serviceId,
          subName,
          ownerName,
          amountCents,
          isOverdue,
        };
      });
  }, [subscriptions, currentUid]);

  const handleConfirmPay = useCallback(async () => {
    if (!selectedRow || !currentUid) return;
    setConfirming(true);
    try {
      await markSubscriptionMemberPaid(selectedRow.subId, currentUid);
      setSelectedRow(null);
      setMethod('cash');
      dismiss();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      Alert.alert('Could not mark as paid', msg);
    } finally {
      setConfirming(false);
    }
  }, [selectedRow, currentUid, dismiss]);

  const handlePayPress = useCallback((row: PendingRow) => {
    setMethod('cash');
    setSelectedRow(row);
  }, []);

  const handleBackToList = useCallback(() => {
    if (confirming) return;
    setSelectedRow(null);
    setMethod('cash');
  }, [confirming]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={confirming ? undefined : dismiss}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdropWrap, { opacity: backdropOp }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: maxSheetH,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />

          {selectedRow ? (
            <ConfirmView
              row={selectedRow}
              method={method}
              onMethodChange={setMethod}
              onConfirm={() => void handleConfirmPay()}
              onBack={handleBackToList}
              confirming={confirming}
            />
          ) : (
            <ListView
              rows={pendingRows}
              onPayPress={handlePayPress}
              onClose={dismiss}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

type ListViewProps = {
  rows: PendingRow[];
  onPayPress: (row: PendingRow) => void;
  onClose: () => void;
};

function ListView({ rows, onPayPress, onClose }: ListViewProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      <View style={styles.listHeader}>
        <Text style={styles.title}>Pay now</Text>
        <Pressable hitSlop={8} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={C.muted} />
        </Pressable>
      </View>
      <Text style={styles.sub}>Your unpaid splits — pay anytime</Text>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={styles.listCards}>
          {rows.map((row) => (
            <PendingPaymentRow key={row.subId} row={row} onPayPress={onPayPress} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

type PendingPaymentRowProps = {
  row: PendingRow;
  onPayPress: (row: PendingRow) => void;
};

function PendingPaymentRow({ row, onPayPress }: PendingPaymentRowProps) {
  return (
    <View style={styles.paymentCard}>
      <View style={styles.paymentCardLeft}>
        <View style={styles.serviceIconWrap}>
          <ServiceIcon
            serviceName={row.serviceName || row.subName}
            serviceId={row.serviceId}
            size={38}
          />
        </View>
        <View style={styles.paymentCardInfo}>
          <View style={styles.paymentCardNameRow}>
            <Text style={styles.paymentCardName} numberOfLines={1}>
              {row.subName}
            </Text>
            {row.isOverdue ? (
              <View style={styles.overdueBadge}>
                <Text style={styles.overdueBadgeText}>Overdue</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.paymentCardOwner} numberOfLines={1}>
            Owned by {row.ownerName}
          </Text>
        </View>
      </View>
      <View style={styles.paymentCardRight}>
        <Text style={[styles.paymentAmount, row.isOverdue && styles.paymentAmountOverdue]}>
          {formatUsdFromCents(row.amountCents)}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.payBtn, pressed && styles.payBtnPressed]}
          onPress={() => onPayPress(row)}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${row.subName}`}
        >
          <Text style={styles.payBtnText}>Pay</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="checkmark-circle" size={32} color={C.green} />
      </View>
      <Text style={styles.emptyTitle}>You're all caught up</Text>
      <Text style={styles.emptySub}>Nothing to pay right now</Text>
    </View>
  );
}

// ─── Confirm view ─────────────────────────────────────────────────────────────

type ConfirmViewProps = {
  row: PendingRow;
  method: PaymentMethod;
  onMethodChange: (m: PaymentMethod) => void;
  onConfirm: () => void;
  onBack: () => void;
  confirming: boolean;
};

function ConfirmView({ row, method, onMethodChange, onConfirm, onBack, confirming }: ConfirmViewProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      <View style={styles.confirmHeader}>
        <Pressable hitSlop={8} onPress={onBack} disabled={confirming} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={C.muted} />
        </Pressable>
        <Text style={styles.confirmHeaderTitle}>Confirm payment</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.confirmServiceWrap}>
        <ServiceIcon
          serviceName={row.serviceName || row.subName}
          serviceId={row.serviceId}
          size={56}
        />
      </View>

      <Text style={styles.confirmSubName}>{row.subName}</Text>
      <Text style={styles.confirmOwnerLine}>Owned by {row.ownerName}</Text>
      <Text style={styles.confirmAmount}>{formatUsdFromCents(row.amountCents)}</Text>

      {row.isOverdue ? (
        <View style={styles.overdueBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={C.amberText} />
          <Text style={styles.overdueBannerText}>This payment is overdue</Text>
        </View>
      ) : null}

      <Text style={styles.methodLabel}>How did you pay?</Text>
      <View style={styles.methodRow}>
        {METHODS.map((m) => (
          <Pressable
            key={m.id}
            style={({ pressed }) => [
              styles.methodPill,
              method === m.id && styles.methodPillSelected,
              pressed && styles.methodPillPressed,
            ]}
            onPress={() => onMethodChange(m.id)}
            accessibilityRole="button"
            accessibilityLabel={m.label}
          >
            <Ionicons
              name={m.icon}
              size={16}
              color={method === m.id ? C.green : C.muted}
              style={styles.methodPillIcon}
            />
            <Text style={[styles.methodPillText, method === m.id && styles.methodPillTextSelected]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.confirmInfoCard}>
        <View style={styles.confirmInfoRow}>
          <Text style={styles.confirmInfoLabel}>Subscription</Text>
          <Text style={styles.confirmInfoValue} numberOfLines={1}>{row.subName}</Text>
        </View>
        <View style={styles.confirmInfoRow}>
          <Text style={styles.confirmInfoLabel}>Amount</Text>
          <Text style={[styles.confirmInfoValue, styles.confirmInfoValueGreen]}>
            {formatUsdFromCents(row.amountCents)}
          </Text>
        </View>
        <View style={[styles.confirmInfoRow, styles.confirmInfoRowLast]}>
          <Text style={styles.confirmInfoLabel}>Method</Text>
          <Text style={styles.confirmInfoValue}>{METHODS.find((m) => m.id === method)?.label}</Text>
        </View>
      </View>

      <Pressable
        onPress={onConfirm}
        disabled={confirming}
        style={({ pressed }) => [
          styles.btnConfirm,
          (pressed || confirming) && styles.btnPressed,
          confirming && styles.btnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Mark as paid"
      >
        {confirming ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnConfirmText}>Mark as paid</Text>
        )}
      </Pressable>

      <Pressable
        onPress={onBack}
        disabled={confirming}
        style={({ pressed }) => [
          styles.btnCancel,
          pressed && !confirming && styles.btnCancelPressed,
          confirming && styles.btnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={styles.btnCancelText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.handle,
    alignSelf: 'center',
    marginBottom: 14,
  },

  // ── List view
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.45,
  },
  sub: {
    fontSize: 14,
    color: C.muted,
    marginBottom: 18,
    lineHeight: 20,
  },
  listCards: {
    gap: 10,
    paddingBottom: 8,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  paymentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  serviceIconWrap: {
    marginRight: 10,
    flexShrink: 0,
  },
  paymentCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  paymentCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  paymentCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  overdueBadge: {
    backgroundColor: C.redLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overdueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.red,
  },
  paymentCardOwner: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  paymentCardRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: 10,
    gap: 6,
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.2,
  },
  paymentAmountOverdue: {
    color: C.red,
  },
  payBtn: {
    backgroundColor: C.green,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  payBtnPressed: {
    opacity: 0.85,
  },
  payBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },

  // ── Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Confirm view
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  confirmHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  confirmServiceWrap: {
    alignSelf: 'center',
    marginBottom: 14,
  },
  confirmSubName: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.45,
    marginBottom: 4,
  },
  confirmOwnerLine: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.amberBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  overdueBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.amberText,
  },
  methodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  methodPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 10,
  },
  methodPillSelected: {
    borderColor: C.green,
    backgroundColor: C.greenLight,
  },
  methodPillPressed: {
    opacity: 0.85,
  },
  methodPillIcon: {
    marginRight: 2,
  },
  methodPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
  },
  methodPillTextSelected: {
    color: C.greenDark,
  },
  confirmInfoCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    marginBottom: 18,
    overflow: 'hidden',
  },
  confirmInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  confirmInfoRowLast: {
    borderBottomWidth: 0,
  },
  confirmInfoLabel: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '500',
  },
  confirmInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  confirmInfoValueGreen: {
    color: C.greenDark,
  },
  btnConfirm: {
    backgroundColor: C.green,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
  },
  btnCancel: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  btnCancelPressed: {
    opacity: 0.7,
  },
  btnCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.muted,
  },
});
