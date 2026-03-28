import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Outer box; hero chart + legend row uses this width (flexShrink:0 on wrap). */
export const HOME_DONUT_SIZE = 180;
const SIZE = HOME_DONUT_SIZE;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 77;
/** Inner hole vs outer ring (larger = more padding between center text and the arc). */
const CUTOUT_RATIO = 0.78;
const INNER_R = OUTER_R * CUTOUT_RATIO;
const R_MID = (OUTER_R + INNER_R) / 2;
const STROKE_W = OUTER_R - INNER_R;
const SPACING_PX = 3;
const GAP_RAD = SPACING_PX / R_MID;

/** Match hero legend segment dots. */
const RED = '#EF4444';
const GREEN = '#22C55E';
const AMBER = '#EAB308';
/** Single ring when all segments are zero (or loading with no totals yet). */
const EMPTY_RING = 'rgba(255,255,255,0.28)';

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const sweep = a1 - a0;
  const large = Math.abs(sweep) > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function formatNet(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '+$0.00';
  const sign = n > 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export type HomeDonutChartProps = {
  youOwe: number;
  owedToYou: number;
  overdue: number;
  loading?: boolean;
};

export function HomeDonutChart({
  youOwe,
  owedToYou,
  overdue,
  loading = false,
}: HomeDonutChartProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.poly(4)),
    });
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.85 * progress.value,
    transform: [
      { translateX: SIZE / 2 },
      { translateY: SIZE / 2 },
      { rotate: `${(1 - progress.value) * 360}deg` },
      { translateX: -SIZE / 2 },
      { translateY: -SIZE / 2 },
    ],
  }));

  const total = youOwe + owedToYou + overdue;
  const values = [youOwe, owedToYou, overdue];
  const colors = [RED, GREEN, AMBER];
  const thetaTotal = 2 * Math.PI - 3 * GAP_RAD;

  const segments: { d: string; color: string; opacity: number }[] = [];
  if (total <= 0.001) {
    const sweep = 2 * Math.PI - 2 * GAP_RAD;
    const a0 = -Math.PI / 2;
    const a1 = a0 + sweep;
    segments.push({
      d: arcPath(CX, CY, R_MID, a0, a1),
      color: EMPTY_RING,
      opacity: 1,
    });
  } else {
    const angles = values.map((v) => (v / total) * thetaTotal);
    let a = -Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const sweep = angles[i]!;
      const a0 = a;
      const a1 = a + sweep;
      segments.push({
        d: arcPath(CX, CY, R_MID, a0, a1),
        color: colors[i]!,
        opacity: 1,
      });
      a = a1 + GAP_RAD;
    }
  }

  const net = owedToYou - youOwe;
  const netColor =
    net > 0.005 ? '#4ADE80' : net < -0.005 ? '#FB7185' : '#ffffff';

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel={`Net balance ${formatNet(net)} this month`}>
      <Animated.View style={[styles.svgClip, wrapStyle]}>
        <Svg width={SIZE} height={SIZE}>
          {segments.map((seg, i) => (
            <Path
              key={i}
              d={seg.d}
              stroke={seg.color}
              strokeWidth={STROKE_W}
              strokeLinecap="round"
              fill="none"
              opacity={seg.opacity}
            />
          ))}
        </Svg>
      </Animated.View>
      <View style={styles.center} pointerEvents="none">
        {loading ? (
          <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
        ) : (
          <>
            <Text style={styles.dcLabel}>net balance</Text>
            <Text style={[styles.dcAmount, { color: netColor }]}>{formatNet(net)}</Text>
            <Text style={styles.dcSub}>this month</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    position: 'relative',
  },
  svgClip: {
    width: SIZE,
    height: SIZE,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dcLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 2,
  },
  dcAmount: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 30,
  },
  dcSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
});
