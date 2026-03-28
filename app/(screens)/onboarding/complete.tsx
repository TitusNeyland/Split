import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { getFirebaseAuth } from '../../../lib/firebase';
import { markOnboardingFullyComplete } from '../../../lib/onboarding/onboardingStorage';

const C = {
  bg: '#FFFFFF',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  green: '#1D9E75',
  greenRing: '#E1F5EE',
  amber: '#EF9F27',
  amberTint: '#FFF4E5',
  cardBg: '#F5F3EE',
};

const CONFETTI_COLORS = ['#7F77DD', '#534AB7', '#E24B4A', '#AFA9EC', '#F09595'] as const;

type FallParticleSpec = {
  id: number;
  color: string;
  leftPct: number;
  duration: number;
  delay: number;
  initialRot: number;
};

function buildFallSpecs(): FallParticleSpec[] {
  return Array.from({ length: 28 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    leftPct: Math.random() * 100,
    duration: 2000 + Math.random() * 2000,
    delay: Math.random() * 2000,
    initialRot: Math.random() * 360,
  }));
}

function FallConfettiParticle({
  screenWidth,
  screenHeight,
  spec,
}: {
  screenWidth: number;
  screenHeight: number;
  spec: FallParticleSpec;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    translateY.setValue(-60 - Math.random() * 80);
    rotate.setValue(0);
    Animated.sequence([
      Animated.delay(spec.delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: screenHeight + 100,
          duration: spec.duration,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(rotate, {
          toValue: 1,
          duration: spec.duration,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]),
    ]).start();
    return () => {
      translateY.stopAnimation();
      rotate.stopAnimation();
    };
  }, [spec.delay, spec.duration, screenHeight, rotate, translateY]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: [`${spec.initialRot}deg`, `${spec.initialRot + 720}deg`],
  });

  const leftPx = (screenWidth * spec.leftPct) / 100 - 4;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confettiParticle,
        {
          left: leftPx,
          top: 0,
          backgroundColor: spec.color,
          transform: [{ translateY }, { rotate: spin }],
        },
      ]}
    />
  );
}

function FallConfettiLayer({ width, height }: { width: number; height: number }) {
  const specs = useMemo(() => buildFallSpecs(), [width, height]);
  if (width <= 0 || height <= 0) return null;
  return (
    <>
      {specs.map((spec) => (
        <FallConfettiParticle key={spec.id} screenWidth={width} screenHeight={height} spec={spec} />
      ))}
    </>
  );
}

function IconClockPurple() {
  const s = 1.5;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={C.purple} strokeWidth={s} />
      <Line x1={12} y1={7} x2={12} y2={12} stroke={C.purple} strokeWidth={s} strokeLinecap="round" />
      <Line x1={12} y1={12} x2={16} y2={14} stroke={C.purple} strokeWidth={s} strokeLinecap="round" />
    </Svg>
  );
}

function IconPeopleGreen() {
  const s = 1.5;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
        stroke={C.green}
        strokeWidth={s}
        strokeLinecap="round"
      />
      <Circle cx={9} cy={7} r={4} stroke={C.green} strokeWidth={s} />
      <Path
        d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke={C.green}
        strokeWidth={s}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function IconReceiptAmber() {
  const s = 1.5;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={C.amber}
        strokeWidth={s}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline points="14 2 14 8 20 8" stroke={C.amber} strokeWidth={s} strokeLinecap="round" />
      <Line x1={16} y1={13} x2={8} y2={13} stroke={C.amber} strokeWidth={s} />
      <Line x1={16} y1={17} x2={8} y2={17} stroke={C.amber} strokeWidth={s} />
      <Line x1={10} y1={9} x2={8} y2={9} stroke={C.amber} strokeWidth={s} />
    </Svg>
  );
}

/** Final onboarding step: confetti, success copy, next actions, and completion persistence on mount. */
export default function OnboardingCompleteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const auth = getFirebaseAuth();
      const uid = auth?.currentUser?.uid ?? null;
      if (!cancelled) await markOnboardingFullyComplete(uid);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goHome = () => {
    router.replace('/(tabs)');
  };

  const goAddSubscription = () => {
    router.replace('/add-subscription');
  };

  const goFriends = () => {
    router.replace('/friends');
  };

  const goScan = () => {
    router.replace('/(tabs)/scan');
  };

  return (
    <View style={styles.root}>
      <View style={styles.confettiStage} pointerEvents="none">
        <FallConfettiLayer width={winW} height={winH} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.column}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>

          <Text style={styles.title}>{"You're all set!"}</Text>
          <Text style={styles.sub}>
            Time to add your first subscription and stop chasing people for money.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={goAddSubscription}
            accessibilityRole="button"
            accessibilityLabel="Add a subscription to split"
          >
            <View style={[styles.cardIcon, { backgroundColor: C.purpleTint }]}>
              <IconClockPurple />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Add a subscription to split</Text>
              <Text style={styles.cardSub}>Spotify, Netflix, iCloud…</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={C.muted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={goFriends}
            accessibilityRole="button"
            accessibilityLabel="Invite your first friend"
          >
            <View style={[styles.cardIcon, { backgroundColor: C.greenRing }]}>
              <IconPeopleGreen />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Invite your first friend</Text>
              <Text style={styles.cardSub}>Share a link or add from contacts</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={C.muted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={goScan}
            accessibilityRole="button"
            accessibilityLabel="Scan a receipt"
          >
            <View style={[styles.cardIcon, { backgroundColor: C.amberTint }]}>
              <IconReceiptAmber />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Scan a receipt</Text>
              <Text style={styles.cardSub}>Open the camera tab to capture</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={C.muted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <Text style={styles.primaryBtnText}>Go to home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  confettiStage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'visible',
  },
  confettiParticle: {
    position: 'absolute',
    width: 8,
    height: 14,
    borderRadius: 2,
    opacity: 0.95,
  },
  scroll: {
    flex: 1,
    zIndex: 1,
    elevation: Platform.OS === 'android' ? 2 : 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 15 * 1.6,
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: C.cardBg,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
  },
  cardSub: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
    lineHeight: 14,
  },
  primaryBtn: {
    width: '100%',
    marginTop: 14,
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
});
