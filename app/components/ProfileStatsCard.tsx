import React, { useEffect, useRef, useState } from 'react';
;
import { View, Text, StyleSheet, Animated, type ViewStyle } from 'react-native';
import { subscribeProfileStats, type ProfileStats } from '../../lib/profileStats';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  green: '#1D9E75',
  skeleton: '#E5E2DC',
};

const DEMO_STATS: ProfileStats = {
  activeSplits: 4,
  collectedTotal: 318,
  friends: 7,
  loading: { activeSplits: false, collectedTotal: false, friends: false },
};

function formatCurrency(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded}`;
  return `$${rounded.toFixed(2)}`;
}

function PulsingBar({ style }: { style: ViewStyle }) {
  const op = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.95, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <Animated.View
      style={[style, { backgroundColor: C.skeleton, opacity: op }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function StatColumn({
  loading,
  value,
  label,
  valueStyle,
}: {
  loading: boolean;
  value: React.ReactNode;
  label: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.col}>
      <View style={styles.valueRow}>
        {loading ? <PulsingBar style={styles.skeletonValue} /> : <Text style={[styles.value, valueStyle]}>{value}</Text>}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

type Props = {
  uid: string | null;
  /** When true, show design-time demo numbers (no Firestore). */
  demoMode: boolean;
};

export default function ProfileStatsCard({ uid, demoMode }: Props) {
  const [stats, setStats] = useState<ProfileStats>(() =>
    demoMode ? DEMO_STATS : emptyIdle()
  );

  useEffect(() => {
    if (demoMode) {
      setStats(DEMO_STATS);
      return;
    }
    if (!uid) {
      setStats(emptyIdle());
      return;
    }
    setStats(allLoading());
    return subscribeProfileStats(uid, setStats);
  }, [uid, demoMode]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <StatColumn
          loading={stats.loading.activeSplits}
          value={stats.activeSplits}
          label="Active splits"
        />
        <View style={styles.divider} />
        <StatColumn
          loading={stats.loading.collectedTotal}
          value={formatCurrency(stats.collectedTotal)}
          label="Collected total"
          valueStyle={styles.valueGreen}
        />
        <View style={styles.divider} />
        <StatColumn loading={stats.loading.friends} value={stats.friends} label="Friends" />
      </View>
    </View>
  );
}

function emptyIdle(): ProfileStats {
  return {
    activeSplits: 0,
    collectedTotal: 0,
    friends: 0,
    loading: { activeSplits: false, collectedTotal: false, friends: false },
  };
}

function allLoading(): ProfileStats {
  return {
    activeSplits: 0,
    collectedTotal: 0,
    friends: 0,
    loading: { activeSplits: true, collectedTotal: true, friends: true },
  };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingVertical: 18,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  valueRow: {
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
  },
  valueGreen: {
    color: C.green,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.16)',
    marginVertical: 2,
    alignSelf: 'stretch',
  },
  skeletonValue: {
    width: 44,
    height: 24,
    borderRadius: 8,
  },
});
