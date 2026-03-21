import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getReceiptAssignSession,
  setReceiptAssignSession,
  clearReceiptAssignSession,
} from '../lib/receiptParseSession';
import { newReceiptId, upsertRecentFromSession } from '../lib/recentReceipts';
import type { AssignReceiptLine, ReceiptAssignSession } from '../lib/receiptTypes';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  muted: '#888780',
  text: '#1a1a18',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F0EEE9',
  rowDivider: '#F5F3EE',
  heroStart: '#6B3FA0',
  heroMid: '#4A1570',
  heroEnd: '#2D0D45',
  lilac: '#EEEDFE',
  mint: '#E1F5EE',
  mintTxt: '#0F6E56',
  peach: '#FAECE7',
  peachTxt: '#993C1D',
  warn: '#B45309',
};

const ASSIGN_ORDER = ['Jordan', 'Alex', 'Sam', 'Split', 'Assign →'] as const;

const DINERS = ['Jordan', 'Alex', 'Sam'] as const;
type Diner = (typeof DINERS)[number];

/** Person who initiated the split (owner pays tip). */
const SPLIT_INITIATOR: Diner = 'Jordan';

const CONFIDENCE_WARN = 0.72;

function isDiner(s: string): s is Diner {
  return (DINERS as readonly string[]).includes(s);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Live per-person totals: food from items (Split → /3), tax/fees proportional to food,
 * tip pooled and redistributed by tipMode (Equally / By share / Owner pays).
 */
function computeLiveBreakdown(
  lines: AssignReceiptLine[],
  tipMode: 'equal' | 'share' | 'owner'
): { rows: { name: string; amt: number }[]; maxAmt: number } {
  const food: Record<Diner, number> = { Jordan: 0, Alex: 0, Sam: 0 };

  const addSplitFood = (t: number) => {
    const x = t / 3;
    food.Jordan += x;
    food.Alex += x;
    food.Sam += x;
  };

  let taxAndFeesPool = 0;
  let tipPool = 0;

  for (const l of lines) {
    if (!l.selected || l.line_total == null || Number.isNaN(l.line_total)) continue;
    const t = l.line_total;
    const a = l.assignedTo;

    if (l.kind === 'item') {
      if (a === 'Assign →') continue;
      if (isDiner(a)) food[a] += t;
      else if (a === 'Split') addSplitFood(t);
      continue;
    }
    if (l.kind === 'tip') {
      tipPool += t;
      continue;
    }
    taxAndFeesPool += t;
  }

  const totalFood = DINERS.reduce((s, d) => s + food[d], 0);

  const taxShare: Record<Diner, number> = { Jordan: 0, Alex: 0, Sam: 0 };
  if (taxAndFeesPool > 0) {
    if (totalFood > 0) {
      for (const d of DINERS) {
        taxShare[d] = round2(taxAndFeesPool * (food[d] / totalFood));
      }
    } else {
      const x = taxAndFeesPool / 3;
      for (const d of DINERS) taxShare[d] = round2(x);
    }
  }

  const tipShare: Record<Diner, number> = { Jordan: 0, Alex: 0, Sam: 0 };
  if (tipPool > 0) {
    if (tipMode === 'owner') {
      tipShare[SPLIT_INITIATOR] = round2(tipPool);
    } else if (tipMode === 'equal') {
      const x = tipPool / 3;
      for (const d of DINERS) tipShare[d] = round2(x);
      const drift = tipPool - DINERS.reduce((s, d) => s + tipShare[d], 0);
      if (Math.abs(drift) >= 0.005) tipShare.Jordan = round2(tipShare.Jordan + drift);
    } else {
      if (totalFood > 0) {
        for (const d of DINERS) {
          tipShare[d] = round2(tipPool * (food[d] / totalFood));
        }
      } else {
        const x = tipPool / 3;
        for (const d of DINERS) tipShare[d] = round2(x);
      }
      const drift = tipPool - DINERS.reduce((s, d) => s + tipShare[d], 0);
      if (Math.abs(drift) >= 0.005) tipShare.Jordan = round2(tipShare.Jordan + drift);
    }
  }

  const rows = DINERS.map((d) => ({
    name: d,
    amt: round2(food[d] + taxShare[d] + tipShare[d]),
  }));

  const maxAmt = Math.max(0.01, ...rows.map((r) => r.amt));

  return { rows, maxAmt };
}

function formatMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toFixed(2)}`;
}

function parseMoneyInput(s: string): number | null {
  const t = s.replace(/[^0-9.]/g, '');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

const PILLS: Record<string, { bg: string; fg: string }> = {
  Jordan: { bg: C.lilac, fg: C.purple },
  Alex: { bg: C.mint, fg: C.mintTxt },
  Sam: { bg: C.peach, fg: C.peachTxt },
  Split: { bg: '#F0EEE9', fg: '#5F5E5A' },
  'Assign →': { bg: '#F0EEE9', fg: C.muted },
};

export default function ReceiptAssignScreen() {
  const insets = useSafeAreaInsets();
  const initial = getReceiptAssignSession();
  const [lines, setLines] = useState<AssignReceiptLine[]>(() => initial?.lines ?? []);
  const [readOnly, setReadOnly] = useState(
    () => Boolean(initial?.readOnly ?? initial?.splitStatus === 'confirmed')
  );
  const merchant = initial?.merchantName ?? 'Receipt';
  const dateLabel = initial?.receiptDate ?? '';
  const overallConfidence = initial?.overallConfidence ?? null;
  const [tipMode, setTipMode] = useState<'equal' | 'share' | 'owner'>('share');
  const [editId, setEditId] = useState<string | null>(null);

  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editUnit, setEditUnit] = useState('');
  const [editTotal, setEditTotal] = useState('');

  const persistSessionRef = useCallback((next: AssignReceiptLine[]) => {
    const s = getReceiptAssignSession();
    if (!s) return;
    const updated: ReceiptAssignSession = { ...s, lines: next };
    setReceiptAssignSession(updated);
    if (!readOnly && updated.splitStatus === 'pending' && updated.receiptId) {
      void upsertRecentFromSession(updated);
    }
  }, [readOnly]);

  const persistSession = useCallback(
    (next: AssignReceiptLine[]) => {
      persistSessionRef(next);
    },
    [persistSessionRef]
  );

  const openEdit = useCallback((row: AssignReceiptLine) => {
    if (readOnly) return;
    setEditId(row.id);
    setEditName(row.name);
    setEditQty(String(row.quantity || 1));
    setEditUnit(row.unit_price != null ? String(row.unit_price) : '');
    setEditTotal(row.line_total != null ? String(row.line_total) : '');
  }, [readOnly]);

  const saveEdit = useCallback(() => {
    if (readOnly || !editId) return;
    const qty = Math.max(1, Number.parseInt(editQty, 10) || 1);
    const unit = parseMoneyInput(editUnit);
    const total = parseMoneyInput(editTotal);
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== editId) return l;
        let line_total = total;
        let unit_price = unit;
        if (line_total == null && unit_price != null) line_total = Math.round(unit_price * qty * 100) / 100;
        if (unit_price == null && line_total != null && qty > 0)
          unit_price = Math.round((line_total / qty) * 100) / 100;
        return {
          ...l,
          name: editName.trim() || 'Item',
          quantity: qty,
          unit_price: unit_price,
          line_total: line_total,
          unreadable: false,
          confidence: Math.max(l.confidence, 0.85),
        };
      });
      persistSessionRef(next);
      return next;
    });
    setEditId(null);
  }, [readOnly, editId, editName, editQty, editUnit, editTotal, persistSessionRef]);

  const toggleCheck = useCallback(
    (id: string) => {
      if (readOnly) return;
      setLines((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l));
        persistSession(next);
        return next;
      });
    },
    [readOnly, persistSession]
  );

  const cycleAssignee = useCallback(
    (id: string) => {
      if (readOnly) return;
      setLines((prev) => {
        const next = prev.map((l) => {
          if (l.id !== id) return l;
          const i = ASSIGN_ORDER.indexOf(l.assignedTo as (typeof ASSIGN_ORDER)[number]);
          const nextIdx = i < 0 ? 0 : (i + 1) % ASSIGN_ORDER.length;
          return { ...l, assignedTo: ASSIGN_ORDER[nextIdx] as string };
        });
        persistSession(next);
        return next;
      });
    },
    [readOnly, persistSession]
  );

  const splitAllEqually = useCallback(() => {
    if (readOnly) return;
    setLines((prev) => {
      const cycle = ['Jordan', 'Alex', 'Sam'];
      let k = 0;
      const next = prev.map((l) => {
        if (l.kind !== 'item') return { ...l, assignedTo: 'Split' };
        const a = cycle[k % cycle.length]!;
        k += 1;
        return { ...l, assignedTo: a, selected: true };
      });
      persistSession(next);
      return next;
    });
  }, [readOnly, persistSession]);

  const onConfirmOrDone = useCallback(() => {
    if (readOnly) {
      clearReceiptAssignSession();
      router.back();
      return;
    }
    const unassigned = lines.filter(
      (l) => l.selected && l.kind === 'item' && l.assignedTo === 'Assign →'
    ).length;
    if (unassigned > 0) return;

    const s = getReceiptAssignSession();
    if (!s) return;
    const id = s.receiptId ?? newReceiptId();
    const { rows: splitRows } = computeLiveBreakdown(lines, tipMode);
    const next: ReceiptAssignSession = {
      ...s,
      lines,
      receiptId: id,
      splitStatus: 'confirmed',
      readOnly: true,
    };
    setReceiptAssignSession(next);
    void upsertRecentFromSession(next);

    const summary = splitRows.map((r) => `${r.name}: ${formatMoney(r.amt)}`).join('\n');
    Alert.alert('Payment requests', `Created for each person:\n${summary}`, [
      {
        text: 'View Activity',
        onPress: () => {
          clearReceiptAssignSession();
          router.replace({ pathname: '/activity', params: { filter: 'receipts' } });
        },
      },
    ]);
  }, [readOnly, lines, tipMode]);

  const totals = useMemo(() => {
    let sum = 0;
    for (const l of lines) {
      if (!l.selected) continue;
      if (l.line_total != null && !Number.isNaN(l.line_total)) sum += l.line_total;
    }
    return Math.round(sum * 100) / 100;
  }, [lines]);

  const { rows: breakdownRows, maxAmt } = useMemo(
    () => computeLiveBreakdown(lines, tipMode),
    [lines, tipMode]
  );

  const unassignedCount = lines.filter(
    (l) => l.selected && l.kind === 'item' && l.assignedTo === 'Assign →'
  ).length;

  const confirmDisabled = !readOnly && unassignedCount > 0;

  const itemCount = lines.filter((l) => l.kind === 'item').length;

  const onBack = useCallback(() => {
    const s = getReceiptAssignSession();
    if (s?.receiptId && s.splitStatus === 'pending' && !readOnly) {
      const worthwhile =
        lines.some((l) => (l.name?.trim().length ?? 0) > 1) ||
        lines.some((l) => l.line_total != null && l.line_total > 0);
      if (worthwhile) void upsertRecentFromSession({ ...s, lines });
    }
    clearReceiptAssignSession();
    router.back();
  }, [lines, readOnly]);

  if (!initial && lines.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.emptyTitle}>No receipt loaded</Text>
        <Pressable style={styles.emptyBtn} onPress={() => router.replace('/(tabs)/scan')}>
          <Text style={styles.emptyBtnTxt}>Go to Scan</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[C.heroStart, C.heroMid, C.heroEnd]}
          locations={[0, 0.6, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 16 }]}
        >
          <Pressable onPress={onBack} style={styles.backRow} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.75)" />
            <Text style={styles.backLbl}>Back</Text>
          </Pressable>
          <View style={styles.receiptMeta}>
            <View style={styles.thumb}>
              <Ionicons name="receipt-outline" size={22} color="rgba(255,255,255,0.7)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.receiptName} numberOfLines={1}>
                {merchant || 'Receipt'}
              </Text>
              <Text style={styles.receiptDate} numberOfLines={2}>
                {dateLabel || 'Date unknown'}
                {itemCount > 0 ? ` · ${itemCount} items` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.aiBadge}>
            <Ionicons
              name={readOnly ? 'lock-closed-outline' : 'checkmark-circle-outline'}
              size={14}
              color="rgba(255,255,255,0.8)"
            />
            <Text style={styles.aiTxt}>
              {readOnly
                ? 'This split was confirmed · view only'
                : 'AI read items — tap a row to edit values or assign'}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.floatCard}>
          <View style={styles.afHeader}>
            <Text style={styles.afTitle}>Assign items</Text>
            <Pressable
              onPress={splitAllEqually}
              disabled={readOnly}
              style={[styles.splitAllWrap, readOnly && { opacity: 0.45 }]}
            >
              <Text style={styles.splitAllBtn}>Split all equally</Text>
            </Pressable>
          </View>

          {lines.map((row, idx) => {
            const isLast = idx === lines.length - 1;
            const mutedRow = row.kind === 'tax' || row.kind === 'tip' || row.kind === 'fee';
            const warn =
              !row.unreadable &&
              (row.confidence < CONFIDENCE_WARN ||
                (overallConfidence != null && overallConfidence < 0.55));
            const pill = PILLS[row.assignedTo] ?? PILLS['Assign →'];
            return (
              <View key={row.id} style={[styles.lineItem, !isLast && styles.lineItemBorder]}>
                <Pressable
                  onPress={() => toggleCheck(row.id)}
                  hitSlop={6}
                  disabled={readOnly}
                  style={[styles.liCheck, row.selected && styles.liCheckOn, readOnly && { opacity: 0.85 }]}
                >
                  {row.selected ? (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : (
                    <View style={styles.liCheckDot} />
                  )}
                </Pressable>
                <Pressable
                  style={styles.liMain}
                  onPress={() => openEdit(row)}
                  disabled={readOnly}
                >
                  <View style={styles.liTitleRow}>
                    <Text
                      style={[styles.liName, mutedRow && styles.liNameMuted, !row.selected && styles.liStrike]}
                      numberOfLines={2}
                    >
                      {row.name || 'Item'}
                    </Text>
                    {warn ? (
                      <Ionicons name="warning-outline" size={16} color={C.warn} style={styles.warnIcon} />
                    ) : null}
                  </View>
                  {row.unreadable ? (
                    <Text style={styles.unreadHint}>Couldn't read this item — edit manually</Text>
                  ) : null}
                </Pressable>
                {row.quantity > 1 && row.kind === 'item' ? (
                  <Text style={styles.liQty}>×{row.quantity}</Text>
                ) : (
                  <View style={{ width: 4 }} />
                )}
                <Pressable
                  onPress={() => cycleAssignee(row.id)}
                  disabled={readOnly}
                  style={[styles.assignPill, { backgroundColor: pill.bg }, readOnly && { opacity: 0.9 }]}
                >
                  <Text style={[styles.assignPillTxt, { color: pill.fg }]} numberOfLines={1}>
                    {row.assignedTo}
                  </Text>
                </Pressable>
                <Text style={[styles.liPrice, mutedRow && styles.liNameMuted, !row.selected && styles.liStrike]}>
                  {formatMoney(row.line_total)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.bodyPad}>
          <View style={styles.tipToggle}>
            <Text style={styles.tipLbl}>Tip split</Text>
            <View style={styles.tipOpts}>
              {(
                [
                  ['equal', 'Equally'],
                  ['share', 'By share'],
                  ['owner', 'Owner pays'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => !readOnly && setTipMode(key)}
                  disabled={readOnly}
                  style={styles.tipOptWrap}
                >
                  <Text
                    style={[styles.tipOpt, tipMode === key && styles.tipOptOn, readOnly && { opacity: 0.55 }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.totalsCard}>
            <View style={styles.totalsHeader}>
              <Text style={styles.totalsTitle}>Breakdown</Text>
              <Text style={[styles.totalsMeta, unassignedCount > 0 && styles.totalsMetaWarn]}>
                {unassignedCount > 0 ? `${unassignedCount} unassigned` : 'All assigned'}
              </Text>
            </View>
            {breakdownRows.map((p) => {
              const pct = maxAmt > 0 ? Math.round((p.amt / maxAmt) * 100) : 0;
              const barColors: Record<string, string> = {
                Jordan: C.purple,
                Alex: '#1D9E75',
                Sam: '#D85A30',
              };
              const pipColors: Record<string, { bg: string; fg: string }> = {
                Jordan: { bg: C.lilac, fg: C.purple },
                Alex: { bg: C.mint, fg: C.mintTxt },
                Sam: { bg: C.peach, fg: C.peachTxt },
              };
              const bar = barColors[p.name] ?? C.purple;
              const pip = pipColors[p.name] ?? { bg: C.lilac, fg: C.purple };
              const initials = p.name
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <View key={p.name} style={styles.personRow}>
                  <View style={[styles.ptPip, { backgroundColor: pip.bg }]}>
                    <Text style={[styles.ptPipTxt, { color: pip.fg }]}>{initials}</Text>
                  </View>
                  <Text style={styles.ptName}>{p.name}</Text>
                  <View style={styles.ptBarWrap}>
                    <View style={[styles.ptBar, { width: `${pct}%`, backgroundColor: bar }]} />
                  </View>
                  <Text style={styles.ptAmt}>{formatMoney(p.amt)}</Text>
                </View>
              );
            })}
            <View style={styles.grandRow}>
              <Text style={styles.grandLbl}>Total</Text>
              <Text style={styles.grandAmt}>{formatMoney(totals)}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.confirmBtn, confirmDisabled && styles.confirmBtnDisabled]}
            disabled={confirmDisabled}
            onPress={onConfirmOrDone}
          >
            <Text style={[styles.confirmBtnTxt, confirmDisabled && styles.confirmBtnTxtDisabled]}>
              {readOnly ? 'Done' : 'Confirm & request payment'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={editId !== null} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditId(null)} />
          <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit line</Text>
              <Text style={styles.modalLbl}>Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={styles.input}
                placeholder="Item name"
                placeholderTextColor={C.muted}
              />
              <Text style={styles.modalLbl}>Quantity</Text>
              <TextInput
                value={editQty}
                onChangeText={setEditQty}
                keyboardType="number-pad"
                style={styles.input}
              />
              <Text style={styles.modalLbl}>Unit price</Text>
              <TextInput
                value={editUnit}
                onChangeText={setEditUnit}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={C.muted}
              />
              <Text style={styles.modalLbl}>Line total</Text>
              <TextInput
                value={editTotal}
                onChangeText={setEditTotal}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={C.muted}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancel} onPress={() => setEditId(null)}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalSave} onPress={saveEdit}>
                  <Text style={styles.modalSaveTxt}>Save</Text>
                </Pressable>
              </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  emptyWrap: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.text },
  emptyBtn: { backgroundColor: C.purple, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  emptyBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
  hero: { paddingHorizontal: 20, paddingBottom: 32 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backLbl: { fontSize: 15, color: 'rgba(255,255,255,0.72)' },
  receiptMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptName: { fontSize: 19, fontWeight: '600', color: '#fff', letterSpacing: -0.3 },
  receiptDate: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  aiTxt: { fontSize: 11, color: 'rgba(255,255,255,0.88)', flex: 1 },
  floatCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    marginHorizontal: 14,
    marginTop: -18,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  afHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  afTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  splitAllWrap: { borderRadius: 8, overflow: 'hidden' },
  splitAllBtn: {
    fontSize: 12,
    fontWeight: '500',
    color: C.purple,
    backgroundColor: C.lilac,
    paddingVertical: 5,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  lineItemBorder: { borderBottomWidth: 0.5, borderBottomColor: C.rowDivider },
  liCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D3D1C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liCheckOn: { backgroundColor: C.purple, borderColor: C.purple },
  liCheckDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D3D1C7' },
  liMain: { flex: 1, minWidth: 0, justifyContent: 'center' },
  liTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liName: { fontSize: 14, fontWeight: '500', color: C.text, flex: 1 },
  liNameMuted: { color: C.muted },
  liStrike: { opacity: 0.45 },
  warnIcon: { marginTop: 1 },
  unreadHint: { fontSize: 11, color: C.warn, marginTop: 2 },
  liQty: { fontSize: 12, color: C.muted, marginRight: 2 },
  assignPill: { borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8, maxWidth: 76 },
  assignPillTxt: { fontSize: 10, fontWeight: '600' },
  liPrice: { fontSize: 14, fontWeight: '600', color: C.text, minWidth: 48, textAlign: 'right' },
  bodyPad: { paddingHorizontal: 14, paddingTop: 4 },
  tipToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  tipLbl: { fontSize: 14, fontWeight: '500', color: C.text },
  tipOpts: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  tipOptWrap: {},
  tipOpt: {
    fontSize: 11,
    fontWeight: '500',
    color: C.muted,
    backgroundColor: '#F0EEE9',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tipOptOn: { backgroundColor: C.lilac, color: C.purple },
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  totalsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  totalsTitle: { fontSize: 12, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalsMeta: { fontSize: 11, color: C.muted },
  totalsMetaWarn: { color: '#C62828', fontWeight: '600' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ptPip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ptPipTxt: { fontSize: 10, fontWeight: '700' },
  ptName: { flex: 1, fontSize: 14, color: C.text },
  ptBarWrap: { width: 70, height: 4, backgroundColor: '#F0EEE9', borderRadius: 2, overflow: 'hidden' },
  ptBar: { height: '100%', borderRadius: 2 },
  ptAmt: { fontSize: 14, fontWeight: '600', color: C.text, minWidth: 52, textAlign: 'right' },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
  },
  grandLbl: { fontSize: 14, fontWeight: '500', color: C.text },
  grandAmt: { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  confirmBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },
  confirmBtnDisabled: {
    backgroundColor: '#B8B3E0',
    opacity: 0.85,
  },
  confirmBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  confirmBtnTxtDisabled: { color: 'rgba(255,255,255,0.85)' },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 16 },
  modalLbl: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: C.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 22 },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt: { fontSize: 16, color: C.muted, fontWeight: '500' },
  modalSave: { backgroundColor: C.purple, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  modalSaveTxt: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
