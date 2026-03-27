import React from 'react';
;
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type HomeSavingsPillProps = {
  savedDollars: number;
  monthsLabel: string;
};

export function HomeSavingsPill({ savedDollars, monthsLabel }: HomeSavingsPillProps) {
  const amt = `$${savedDollars.toFixed(2)}`;

  return (
    <View style={styles.pill} accessibilityRole="summary" accessibilityLabel={`Saved by splitting ${amt} versus paying alone. ${monthsLabel} since joining.`}>
      <View style={styles.iconCircle}>
        <Ionicons name="star" size={20} color="rgba(134,239,172,0.95)" />
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 19,
    fontWeight: '700',
    color: '#86efac',
    letterSpacing: -0.4,
    lineHeight: 24,
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
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
  },
});
