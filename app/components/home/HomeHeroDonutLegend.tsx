import React from 'react';
;
import { View, Text, StyleSheet } from 'react-native';

/** Same hex as `HomeDonutChart` ring segments (dots + amounts). */
const DOT_RED = '#EF4444';
const DOT_GREEN = '#22C55E';
const DOT_AMBER = '#EAB308';

export type HomeHeroDonutLegendProps = {
  youOwe: number;
  owedToYou: number;
  overdue: number;
};

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function HomeHeroDonutLegend({
  youOwe,
  owedToYou,
  overdue,
}: HomeHeroDonutLegendProps) {
  return (
    <View style={styles.legendCol}>
      <View style={styles.legItem}>
        <View style={styles.legDotWrap}>
          <View style={[styles.legDot, { backgroundColor: DOT_RED }]} />
        </View>
        <View style={styles.legContent}>
          <Text style={styles.legLabel}>You owe</Text>
          <Text style={[styles.legAmt, { color: DOT_RED }]}>{fmt(youOwe)}</Text>
        </View>
      </View>
      <View style={styles.legItem}>
        <View style={styles.legDotWrap}>
          <View style={[styles.legDot, { backgroundColor: DOT_GREEN }]} />
        </View>
        <View style={styles.legContent}>
          <Text style={styles.legLabel}>Owed to you</Text>
          <Text style={[styles.legAmt, { color: DOT_GREEN }]}>{fmt(owedToYou)}</Text>
        </View>
      </View>
      <View style={styles.legItem}>
        <View style={styles.legDotWrap}>
          <View style={[styles.legDot, { backgroundColor: DOT_AMBER }]} />
        </View>
        <View style={styles.legContent}>
          <Text style={styles.legLabel}>Pending</Text>
          <Text style={[styles.legAmt, { color: DOT_AMBER }]}>{fmt(overdue)}</Text>
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
