import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatUsdDollarsFixed2 } from '../../lib/format/currency';

/** Same hex as `HomeDonutChart` ring segments (dots + amounts). */
const DOT_GREEN = '#22C55E';
const PENDING_BLUE = '#60a5fa';
const OVERDUE_AMBER = '#f59e0b';

export type HomeHeroDonutLegendProps = {
  saved: number;
  pending: number;
  overdue: number;
};

export function HomeHeroDonutLegend({
  saved,
  pending,
  overdue,
}: HomeHeroDonutLegendProps) {
  return (
    <View style={styles.legendCol}>
      <View style={styles.legItem}>
        <View style={styles.legDotWrap}>
          <View style={[styles.legDot, { backgroundColor: DOT_GREEN }]} />
        </View>
        <View style={styles.legContent}>
          <Text style={styles.legLabel}>Saved</Text>
          <Text style={[styles.legAmt, { color: DOT_GREEN }]}>{formatUsdDollarsFixed2(saved)}</Text>
        </View>
      </View>
      <View style={styles.legItem}>
        <View style={styles.legDotWrap}>
          <View style={[styles.legDot, { backgroundColor: PENDING_BLUE }]} />
        </View>
        <View style={styles.legContent}>
          <Text style={styles.legLabel}>Pending</Text>
          <Text style={[styles.legAmt, { color: PENDING_BLUE }]}>{formatUsdDollarsFixed2(pending)}</Text>
        </View>
      </View>
      <View style={styles.legItem}>
        <View style={styles.legDotWrap}>
          <View style={[styles.legDot, { backgroundColor: OVERDUE_AMBER }]} />
        </View>
        <View style={styles.legContent}>
          <Text style={styles.legLabel}>Owed to you</Text>
          <Text style={[styles.legAmt, { color: OVERDUE_AMBER }]}>{formatUsdDollarsFixed2(overdue)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legendCol: {
    flex: 1,
    gap: 10,
    minWidth: 0,
    justifyContent: 'center',
    marginLeft: 8,
  },
  legItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  legDotWrap: {
    justifyContent: 'center',
    marginTop: 3,
  },
  legDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legContent: {
    flex: 1,
    minWidth: 0,
  },
  legLabel: {
    fontSize: 12,
    color: '#ffffff',
    lineHeight: 15,
  },
  legAmt: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 22,
    marginTop: 2,
  },
});
