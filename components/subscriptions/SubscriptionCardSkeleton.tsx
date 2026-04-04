import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const C = {
  track: '#E5E2DC',
};

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

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
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.row}>
        <View style={styles.icon} />
        <View style={styles.mid}>
          <View style={styles.lineLg} />
          <View style={styles.lineSm} />
        </View>
        <View style={styles.right}>
          <View style={styles.lineMd} />
          <View style={styles.lineXs} />
        </View>
      </View>
      <View style={styles.row2}>
        <View style={styles.pip} />
        <View style={styles.pip} />
        <View style={styles.pip} />
        <View style={styles.pill} />
      </View>
      <View style={styles.bar} />
    </Animated.View>
  );
}

export function SubscriptionCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 168,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.track,
  },
  mid: {
    flex: 1,
    gap: 8,
  },
  lineLg: {
    height: 13,
    borderRadius: 6,
    backgroundColor: C.track,
    width: '72%',
  },
  lineSm: {
    height: 10,
    borderRadius: 5,
    backgroundColor: C.track,
    width: '48%',
    opacity: 0.85,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
  },
  lineMd: {
    height: 16,
    borderRadius: 6,
    backgroundColor: C.track,
    width: 56,
  },
  lineXs: {
    height: 10,
    borderRadius: 5,
    backgroundColor: C.track,
    width: 44,
    opacity: 0.85,
  },
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  pip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.track,
  },
  pill: {
    marginLeft: 'auto',
    width: 72,
    height: 18,
    borderRadius: 8,
    backgroundColor: C.track,
  },
  bar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.track,
    width: '100%',
  },
});
