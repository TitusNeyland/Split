import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { HomeFloatCardModel } from '../../../lib/home/homeSubscriptionMath';
import { formatUsdDollarsFixed2 } from '../../../lib/format/currency';

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  red: '#E24B4A',
  orange: '#EF9F27',
  border: 'rgba(0,0,0,0.06)',
};

type Props = {
  model: HomeFloatCardModel;
  hasSubscriptions: boolean;
  /** True while Firestore subscription snapshot is loading (avoid CTA flash). */
  loading?: boolean;
};

export function HomeFloatCard({ model, hasSubscriptions, loading = false }: Props) {
  const router = useRouter();
  const { youOweRow, pendingRow, overdueRow } = model;
  const anyRow = youOweRow || pendingRow || overdueRow;

  if (loading) {
    return (
      <View style={styles.card} accessibilityLabel="Loading balances">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={styles.skelDot} />
            <View style={styles.skelMid}>
              <View style={styles.skelLineLg} />
              <View style={styles.skelLineSm} />
            </View>
            <View style={styles.skelAmt} />
          </View>
        ))}
      </View>
    );
  }

  if (!hasSubscriptions) {
    return (
      <Pressable
        style={styles.ctaCard}
        onPress={() => router.push('/add-subscription')}
        accessibilityRole="button"
        accessibilityLabel="Add your first split"
      >
        <Ionicons name="add-circle-outline" size={28} color={C.purple} />
        <View style={styles.ctaMid}>
          <Text style={styles.ctaTitle}>Add your first split</Text>
          <Text style={styles.ctaSub}>Track shared subscriptions and who owes what</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={C.muted} />
      </Pressable>
    );
  }

  if (!anyRow) {
    return null;
  }

  return (
    <View style={styles.card}>
      {youOweRow ? (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/subscription/${youOweRow.subscriptionId}`)}
          accessibilityRole="button"
        >
          <View style={[styles.dot, { backgroundColor: C.red }]} />
          <View style={styles.rowMid}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              You owe · {youOweRow.name}
            </Text>
            <Text style={styles.rowSub}>
              {youOweRow.daysUntil === 0
                ? 'Due today'
                : youOweRow.daysUntil === 1
                  ? 'Due tomorrow'
                  : `Due in ${youOweRow.daysUntil} days`}
            </Text>
          </View>
          <Text style={styles.rowAmt}>{formatUsdDollarsFixed2(youOweRow.amountDollars)}</Text>
        </Pressable>
      ) : null}

      {pendingRow ? (
        <View style={[styles.row, youOweRow && styles.rowBorder]}>
          <View style={[styles.dot, { backgroundColor: C.orange }]} />
          <View style={styles.rowMid}>
            <Text style={styles.rowTitle}>Pending from {pendingRow.pendingCount} people</Text>
            <Text style={styles.rowSub}>Collect on your subscriptions</Text>
          </View>
          <Text style={styles.rowAmt}>{formatUsdDollarsFixed2(pendingRow.totalDollars)}</Text>
        </View>
      ) : null}

      {overdueRow ? (
        <Pressable
          style={[styles.row, (youOweRow || pendingRow) && styles.rowBorder]}
          onPress={() => router.push(`/subscription/${overdueRow.subscriptionId}`)}
          accessibilityRole="button"
        >
          <View style={[styles.dot, { backgroundColor: C.red }]} />
          <View style={styles.rowMid}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              Overdue · {overdueRow.name}
            </Text>
            <Text style={styles.rowSub}>Member payment overdue</Text>
          </View>
          <Text style={[styles.rowAmt, { color: C.red }]}>{formatUsdDollarsFixed2(overdueRow.amountDollars)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.bg,
    borderRadius: 18,
    marginHorizontal: 14,
    marginTop: -12,
    marginBottom: 4,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.bg,
    borderRadius: 18,
    marginHorizontal: 14,
    marginTop: -12,
    marginBottom: 4,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  ctaMid: { flex: 1, minWidth: 0 },
  ctaTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  ctaSub: { fontSize: 13, color: C.muted, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: '600', color: C.text },
  skelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  skelMid: { flex: 1, minWidth: 0, gap: 8 },
  skelLineLg: {
    height: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    width: '72%',
    maxWidth: 220,
  },
  skelLineSm: {
    height: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    width: '48%',
    maxWidth: 140,
  },
  skelAmt: {
    width: 48,
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
});
