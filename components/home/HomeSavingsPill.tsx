import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatUsdDollarsWhole } from '../../lib/format/currency';

/** Brighter than chart “Owed to you” green (`#22C55E`) so the pill reads clearly on the hero. */
const SAVINGS_AMOUNT_GREEN = '#4ADE80';

export type HomeSavingsPillProps = {
  savedDollars: number;
  monthsLabel: string;
};

export function HomeSavingsPill({ savedDollars, monthsLabel }: HomeSavingsPillProps) {
  const amt = formatUsdDollarsWhole(savedDollars);

  return (
    <View style={styles.pill} accessibilityRole="summary" accessibilityLabel={`Saved by splitting ${amt} versus paying alone. ${monthsLabel} since joining.`}>
      <View style={styles.iconCircle}>
        <Ionicons name="star" size={22} color={SAVINGS_AMOUNT_GREEN} />
      </View>
      <View style={styles.center}>
        <Text style={styles.label}>Saved by splitting</Text>
        <Text style={styles.amount}>{amt}</Text>
        <Text style={styles.sub}>vs paying alone</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.since}>since joining</Text>
        <Text style={styles.months}>{monthsLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.45)',
  },
  amount: {
    fontSize: 26,
    fontWeight: '700',
    color: SAVINGS_AMOUNT_GREEN,
    letterSpacing: -0.5,
    lineHeight: 30,
    marginTop: 3,
  },
  sub: {
    fontSize: 12,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 3,
  },
  right: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  since: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.3)',
  },
  months: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
  },
});
