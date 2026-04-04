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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../../components/shared/ServiceIcon';
import { UserAvatarCircle } from '../../components/shared/UserAvatarCircle';
import { fmtCents } from '../../lib/subscription/addSubscriptionSplitMath';

const C = {
  bg: '#FFFFFF',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  green: '#1D9E75',
  cardBg: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.08)',
  divider: '#F0EEE9',
};

const CONFETTI_COLORS = ['#7F77DD', '#534AB7', '#1D9E75', '#AFA9EC', '#86efac'] as const;

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

  const leftPx = (screenWidth * spec.leftPct) / 100 - 6;

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

type Pip = {
  initials: string;
  bg: string;
  color: string;
  highlight?: boolean;
  uid?: string;
  imageUrl?: string | null;
};

function parseMemberPips(raw: string | undefined): Pip[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const decoded = decodeURIComponent(raw);
    const arr = JSON.parse(decoded) as Pip[];
    if (!Array.isArray(arr)) return [];
    return arr.map((p) => ({
      initials: String(p.initials ?? ''),
      bg: String(p.bg ?? '#EEEDFE'),
      color: String(p.color ?? '#534AB7'),
      highlight: Boolean(p.highlight),
      uid: typeof p.uid === 'string' && p.uid.trim() ? p.uid.trim() : undefined,
      imageUrl:
        typeof p.imageUrl === 'string' && p.imageUrl.trim()
          ? p.imageUrl.trim()
          : p.imageUrl === null
            ? null
            : undefined,
    }));
  } catch {
    return [];
  }
}

function buildSubLabel(subName: string, ownerFirst: string, nOthers: number): string {
  const base = `You're now splitting ${subName} with`;
  if (nOthers <= 0) return `${base} ${ownerFirst}.`;
  if (nOthers === 1) return `${base} ${ownerFirst} and 1 other.`;
  return `${base} ${ownerFirst} and ${nOthers} others.`;
}

function paramStr(v: string | string[] | undefined): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? '';
  return '';
}

export default function SplitJoinedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{
    subscriptionId?: string | string[];
    subscriptionName?: string | string[];
    serviceId?: string | string[];
    ownerName?: string | string[];
    ownerFirst?: string | string[];
    userShare?: string | string[];
    firstCharge?: string | string[];
    autoCharge?: string | string[];
    memberCount?: string | string[];
    memberPipsJson?: string | string[];
  }>();

  const subscriptionId = paramStr(params.subscriptionId).trim();
  const subscriptionName = paramStr(params.subscriptionName).trim() || 'Subscription';
  const serviceId = paramStr(params.serviceId).trim();
  const ownerName = paramStr(params.ownerName).trim() || 'Owner';
  const ownerFirstRaw = paramStr(params.ownerFirst).trim();
  const ownerFirst = ownerFirstRaw || ownerName.split(/\s+/)[0] || 'Owner';
  const userShareCents = (() => {
    const n = parseInt(paramStr(params.userShare) || '0', 10);
    return Number.isFinite(n) ? n : 0;
  })();
  const firstCharge = paramStr(params.firstCharge).trim() || '—';
  const autoCharge = paramStr(params.autoCharge) === 'on' ? 'on' : 'off';
  const memberCount = (() => {
    const n = parseInt(paramStr(params.memberCount) || '0', 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  })();
  const pipsJson = paramStr(params.memberPipsJson);
  const pips = useMemo(() => parseMemberPips(pipsJson), [pipsJson]);

  const subLabel = useMemo(
    () => buildSubLabel(subscriptionName, ownerFirst, memberCount),
    [subscriptionName, ownerFirst, memberCount]
  );

  const onViewSplit = () => {
    if (subscriptionId) {
      router.replace({
        pathname: '/subscription/[id]',
        params: { id: subscriptionId, backToSubs: '1' },
      });
    } else {
      router.replace('/(tabs)');
    }
  };

  const onGoHome = () => {
    router.replace('/(tabs)');
  };

  if (!subscriptionId) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Text style={styles.errTxt}>Missing split details.</Text>
        <Pressable style={styles.ghostBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.ghostBtnTxt}>Go to home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.confettiStage} pointerEvents="none">
        <FallConfettiLayer width={winW} height={winH} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.column}>
          <View style={styles.iconWrap}>
            <ServiceIcon serviceName={subscriptionName} serviceId={serviceId || undefined} size={56} />
          </View>

          <Text style={styles.title}>{`You joined ${subscriptionName}!`}</Text>
          <Text style={styles.sub}>{subLabel}</Text>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLbl}>Your share</Text>
              <Text style={styles.cardValPurple}>
                {fmtCents(userShareCents)}
                <Text style={styles.cardValPurpleDim}> /month</Text>
              </Text>
            </View>
            <View style={styles.hr} />
            <View style={styles.cardRow}>
              <Text style={styles.cardLbl}>First charge</Text>
              <Text style={styles.cardValDark}>{firstCharge}</Text>
            </View>
            <View style={styles.hr} />
            <View style={styles.cardRow}>
              <Text style={styles.cardLbl}>Auto-charge</Text>
              <View style={styles.autoRow}>
                <Text style={styles.cardValDark}>{autoCharge === 'on' ? 'On' : 'Off'}</Text>
                {autoCharge === 'on' ? (
                  <Ionicons name="checkmark-circle" size={18} color={C.green} style={styles.autoCheck} />
                ) : null}
              </View>
            </View>
            <View style={styles.hr} />
            <View style={styles.cardRow}>
              <Text style={styles.cardLbl}>Split owner</Text>
              <Text style={styles.cardValDark}>{ownerName}</Text>
            </View>
          </View>

          <View style={styles.groupBlock}>
            <Text style={styles.groupLbl}>Your group</Text>
            <View style={styles.pipRow}>
            {pips.map((p, i) => (
              <View
                key={`${p.uid ?? p.initials}-${i}`}
                style={[styles.pipRing, p.highlight && styles.pipRingHighlight]}
              >
                <View style={styles.pip}>
                  <UserAvatarCircle
                    size={40}
                    uid={p.uid}
                    initials={p.initials}
                    imageUrl={p.imageUrl}
                    initialsBackgroundColor={p.bg}
                    initialsTextColor={p.color}
                  />
                </View>
              </View>
            ))}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={onViewSplit}
            accessibilityRole="button"
            accessibilityLabel="View split"
          >
            <Text style={styles.primaryBtnTxt}>View split</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.ghostBtnMain, pressed && styles.ghostBtnMainPressed]}
            onPress={onGoHome}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <Text style={styles.ghostBtnMainTxt}>Go to home</Text>
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
    width: 12,
    height: 21,
    borderRadius: 3,
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
    alignItems: 'center',
    width: '100%',
  },
  iconWrap: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  sub: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 14 * 1.6,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  card: {
    width: '100%',
    backgroundColor: C.cardBg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.cardBorder,
    paddingVertical: 4,
    marginBottom: 28,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cardLbl: {
    fontSize: 15,
    color: C.muted,
  },
  cardValPurple: {
    fontSize: 16,
    fontWeight: '700',
    color: C.purple,
  },
  cardValPurpleDim: {
    fontSize: 14,
    fontWeight: '600',
    color: C.purple,
    opacity: 0.85,
  },
  cardValDark: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoCheck: {
    marginLeft: 6,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 18,
  },
  groupBlock: {
    width: '100%',
    marginBottom: 32,
  },
  groupLbl: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 12,
  },
  pipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  pipRing: {
    padding: 2,
    borderRadius: 999,
  },
  pipRingHighlight: {
    borderWidth: 2,
    borderColor: C.green,
  },
  pip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipTxt: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  ghostBtnMain: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: 'transparent',
  },
  ghostBtnMainPressed: {
    opacity: 0.85,
  },
  ghostBtnMainTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: C.muted,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errTxt: {
    fontSize: 16,
    color: C.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ghostBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.purple,
  },
});
