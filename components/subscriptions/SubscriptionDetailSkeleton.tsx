import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const C = {
  hero: 'rgba(255,255,255,0.22)',
  body: '#E5E2DC',
};

function PulseBlock({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]} />;
}

/**
 * Loading placeholders for subscription detail (hero + member rows). Per spec: skeleton while Firestore loads.
 */
export function SubscriptionDetailSkeleton() {
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <PulseBlock style={styles.heroIcon} />
        <PulseBlock style={styles.heroTitle} />
        <PulseBlock style={styles.heroAmt} />
        <PulseBlock style={styles.heroLine} />
        <View style={styles.badgeRow}>
          <PulseBlock style={styles.badge} />
          <PulseBlock style={styles.badge} />
        </View>
      </View>
      <View style={styles.body}>
        <PulseBlock style={styles.sectionTitle} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.row}>
            <PulseBlock style={styles.pip} />
            <View style={styles.rowMid}>
              <PulseBlock style={styles.rowName} />
              <PulseBlock style={styles.rowPct} />
            </View>
            <PulseBlock style={styles.rowAmt} />
          </View>
        ))}
        <PulseBlock style={styles.prog} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  hero: {
    backgroundColor: '#4A1570',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
    alignItems: 'center',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.hero,
    marginBottom: 14,
  },
  heroTitle: {
    width: '72%',
    height: 22,
    borderRadius: 8,
    backgroundColor: C.hero,
    marginBottom: 10,
  },
  heroAmt: {
    width: 100,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.hero,
    marginBottom: 8,
  },
  heroLine: {
    width: '55%',
    height: 14,
    borderRadius: 6,
    backgroundColor: C.hero,
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    width: 72,
    height: 26,
    borderRadius: 10,
    backgroundColor: C.hero,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    width: '38%',
    height: 13,
    borderRadius: 6,
    backgroundColor: C.body,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  pip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.body,
  },
  rowMid: {
    flex: 1,
    gap: 6,
  },
  rowName: {
    height: 14,
    borderRadius: 6,
    backgroundColor: C.body,
    width: '62%',
  },
  rowPct: {
    height: 11,
    borderRadius: 5,
    backgroundColor: C.body,
    width: '28%',
  },
  rowAmt: {
    width: 56,
    height: 18,
    borderRadius: 6,
    backgroundColor: C.body,
  },
  prog: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.body,
    marginTop: 8,
    width: '100%',
  },
});
