import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  BackHandler,
  Share,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { fmtCents } from '../../lib/subscription/addSubscriptionSplitMath';
import { UserAvatarCircle } from '../../components/shared/UserAvatarCircle';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  bg: '#FFFFFF',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  greenRing: '#E1F5EE',
  green: '#1D9E75',
  cardBg: '#F5F3EE',
};

/** Matches split-joined celebration confetti palette. */
const CONFETTI_COLORS = ['#7F77DD', '#534AB7', '#1D9E75', '#AFA9EC', '#86efac'] as const;

const PIECE_WIDTH = 12;
const PIECE_HEIGHT = 21;
const PIECE_COUNT = 28;

type ParticleSpec = {
  id: number;
  color: string;
  delay: number;
  angle: number;
  burstDist: number;
  driftX: number;
  fallY: number;
  rotations: number;
};

function ConfettiParticle({
  originLeft,
  originTop,
  color,
  delay,
  angle,
  burstDist,
  driftX,
  fallY,
  rotations,
}: ParticleSpec & { originLeft: number; originTop: number }) {
  const w = PIECE_WIDTH;
  const h = PIECE_HEIGHT;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const rot = useRef(new Animated.Value(0)).current;

  const burstX = Math.cos(angle) * burstDist;
  const burstY = -Math.abs(Math.sin(angle)) * burstDist - 60 - (h % 9) * 8;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(tx, {
            toValue: burstX + driftX * 0.22,
            duration: 380,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(ty, {
            toValue: burstY,
            duration: 380,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(rot, {
            toValue: 0.22,
            duration: 380,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
        ]),
        Animated.parallel([
          Animated.timing(tx, {
            toValue: burstX + driftX,
            duration: 3600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
          Animated.timing(ty, {
            toValue: fallY,
            duration: 3600,
            useNativeDriver: true,
            easing: Easing.bezier(0.33, 0, 0.66, 0.68),
          }),
          Animated.timing(rot, {
            toValue: 1,
            duration: 3600,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
        ]),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, [burstX, burstY, delay, driftX, fallY, h, tx, ty, rot]);

  const spin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${rotations * 360}deg`],
  });

  return (
    <Animated.View
      style={[
        styles.confettiParticle,
        {
          left: originLeft - w / 2,
          top: originTop - h / 2,
          width: PIECE_WIDTH,
          height: PIECE_HEIGHT,
          borderRadius: 3,
          backgroundColor: color,
          transform: [{ translateX: tx }, { translateY: ty }, { rotate: spin }],
        },
      ]}
    />
  );
}

function buildParticleSpecs(screenHeight: number, originTop: number): ParticleSpec[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => {
    const golden = (i * 2.399963229728653) % (Math.PI * 2);
    const jitter = ((i * 17) % 100) / 100 - 0.5;
    return {
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      delay: (i * 28) % 300,
      angle: golden + jitter * 0.5,
      burstDist: 90 + (i % 9) * 22,
      driftX: -200 + ((i * 47) % 400),
      fallY: screenHeight - originTop + 180 + (i % 6) * 40,
      rotations: 3 + (i % 6),
    };
  });
}

type AvatarPip = {
  initials: string;
  avatarBg: string;
  avatarColor: string;
  uid?: string | null;
};

function parseInviteAvatars(raw: string | undefined): AvatarPip[] {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const decoded = decodeURIComponent(raw);
    const arr = JSON.parse(decoded) as AvatarPip[];
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => ({
      initials: String(a.initials ?? ''),
      avatarBg: String(a.avatarBg ?? '#EEEDFE'),
      avatarColor: String(a.avatarColor ?? C.purple),
      uid: typeof a.uid === 'string' && a.uid.trim() ? a.uid.trim() : a.uid === null ? null : undefined,
    }));
  } catch {
    return [];
  }
}

export default function SplitCreatedScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{
    planName?: string;
    totalCents?: string;
    billingCycle?: string;
    inviteCount?: string;
    inviteAvatarsJson?: string;
  }>();

  const planName = typeof params.planName === 'string' ? params.planName.trim() : 'Subscription';
  const totalCentsRaw = typeof params.totalCents === 'string' ? parseInt(params.totalCents, 10) : 0;
  const totalCents = Number.isFinite(totalCentsRaw) && totalCentsRaw >= 0 ? totalCentsRaw : 0;
  const billingCycle =
    typeof params.billingCycle === 'string' && params.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const inviteCountRaw = typeof params.inviteCount === 'string' ? parseInt(params.inviteCount, 10) : 0;
  const inviteCount = Number.isFinite(inviteCountRaw) && inviteCountRaw >= 0 ? inviteCountRaw : 0;
  const inviteAvatars = useMemo(
    () => parseInviteAvatars(params.inviteAvatarsJson),
    [params.inviteAvatarsJson],
  );

  const checkRef = useRef<View>(null);
  const didMeasureBurst = useRef(false);
  const [burstCenter, setBurstCenter] = useState({
    x: screenWidth / 2,
    y: insets.top + screenHeight * 0.32,
  });
  const [burstReady, setBurstReady] = useState(false);

  const onCheckLayout = useCallback(() => {
    if (didMeasureBurst.current) return;
    didMeasureBurst.current = true;
    requestAnimationFrame(() => {
      checkRef.current?.measureInWindow((x, y, w, h) => {
        setBurstCenter({ x: x + w / 2, y: y + h / 2 });
        setBurstReady(true);
      });
    });
  }, []);

  const particleSpecs = useMemo(
    () => buildParticleSpecs(screenHeight, burstCenter.y),
    [screenHeight, burstCenter.y],
  );

  const goToSubscriptions = useCallback(() => {
    router.replace('/(tabs)/subscriptions');
  }, [router]);

  const goToAddFlow = useCallback(() => {
    router.replace('/add-subscription');
  }, [router]);

  const onInviteFriends = useCallback(async () => {
    try {
      await Share.share({
        message:
          Platform.OS === 'ios'
            ? `Join my splits on Split — shared subscriptions made easy.`
            : `Join my splits on Split — shared subscriptions made easy.\nhttps://split.app`,
      });
    } catch {
      /* user dismissed */
    }
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goToSubscriptions();
      return true;
    });
    return () => sub.remove();
  }, [goToSubscriptions]);

  const costLine = useMemo(() => {
    const c = fmtCents(totalCents);
    return billingCycle === 'yearly' ? `${planName} · ${c}/year` : `${planName} · ${c}/month`;
  }, [planName, totalCents, billingCycle]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.flexScroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + 6,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View ref={checkRef} onLayout={onCheckLayout} collapsable={false}>
          <View style={styles.checkRing}>
            <Ionicons name="checkmark" size={46} color={C.green} />
          </View>
        </View>
        <Text style={styles.title}>Split created!</Text>
        <Text style={styles.sub}>{costLine}</Text>

        <View style={styles.inviteBlock}>
          {inviteAvatars.length > 0 ? (
            <View style={styles.pipRow}>
              {inviteAvatars.map((p, i) => (
                <View
                  key={i}
                  style={{
                    marginLeft: i === 0 ? 0 : -12,
                    zIndex: inviteAvatars.length - i,
                  }}
                >
                  <UserAvatarCircle
                    size={42}
                    uid={p.uid ?? null}
                    initials={p.initials}
                    initialsBackgroundColor={p.avatarBg}
                    initialsTextColor={p.avatarColor}
                    borderWidth={2}
                    borderColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.inviteLbl}>
            {inviteCount > 0
              ? `Invites sent to ${inviteCount} member${inviteCount === 1 ? '' : 's'}`
              : 'You can invite people anytime from this subscription.'}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.nextCard, pressed && styles.nextCardPressed]}
          onPress={goToAddFlow}
          accessibilityRole="button"
          accessibilityLabel="Add another subscription"
        >
          <View style={[styles.nextIco, { backgroundColor: C.purpleTint }]}>
            <Ionicons name="time-outline" size={24} color={C.purple} />
          </View>
          <View style={styles.nextTextWrap}>
            <Text style={styles.nextTitle}>Add another subscription</Text>
            <Text style={styles.nextSub}>Spotify, iCloud, Xbox…</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={C.muted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.nextCard, pressed && styles.nextCardPressed]}
          onPress={onInviteFriends}
          accessibilityRole="button"
          accessibilityLabel="Invite more friends"
        >
          <View style={[styles.nextIco, { backgroundColor: C.greenRing }]}>
            <Ionicons name="person-add-outline" size={24} color={C.green} />
          </View>
          <View style={styles.nextTextWrap}>
            <Text style={styles.nextTitle}>Invite more friends</Text>
            <Text style={styles.nextSub}>Share a link or add from contacts</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={C.muted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={goToSubscriptions}
          accessibilityRole="button"
          accessibilityLabel="Back to subscriptions"
        >
          <Text style={styles.primaryBtnTxt}>Back to subscriptions</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.confettiStage} pointerEvents="none">
        {burstReady
          ? particleSpecs.map((spec) => (
              <ConfettiParticle
                key={spec.id}
                {...spec}
                originLeft={burstCenter.x}
                originTop={burstCenter.y}
              />
            ))
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  flexScroll: {
    flex: 1,
  },
  confettiStage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    overflow: 'hidden',
  },
  confettiParticle: {
    position: 'absolute',
    opacity: 0.95,
  },
  scrollContent: {
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  checkRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.greenRing,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.6,
    marginBottom: 10,
    textAlign: 'center',
  },
  sub: {
    fontSize: 18,
    color: C.muted,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 26,
    paddingHorizontal: 8,
  },
  inviteBlock: {
    alignItems: 'center',
    marginBottom: 26,
    minHeight: 48,
  },
  pipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  inviteLbl: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: C.cardBg,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 14,
  },
  nextCardPressed: {
    opacity: 0.92,
  },
  nextIco: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTextWrap: {
    flex: 1,
  },
  nextTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
  },
  nextSub: {
    fontSize: 15,
    color: C.muted,
    marginTop: 3,
    lineHeight: 20,
  },
  primaryBtn: {
    width: '100%',
    marginTop: 16,
    paddingVertical: 18,
    backgroundColor: C.purple,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnTxt: {
    fontSize: 19,
    fontWeight: '600',
    color: '#fff',
  },
});
