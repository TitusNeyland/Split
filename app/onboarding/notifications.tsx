import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Polyline } from 'react-native-svg';
import { useOnboardingBack } from './useOnboardingBack';
import { saveNotificationPermissionEnabled } from '../../lib/notificationPermissionFirestore';
import { setOnboardingNotificationsStepDone } from '../../lib/onboardingStorage';

const C = {
  bg: '#F5F5F7',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  gradStart: '#7F77DD',
  cardBg: '#3A3A3C',
  whiteMuted: 'rgba(255,255,255,0.7)',
  whiteDim: 'rgba(255,255,255,0.4)',
  whiteMid: 'rgba(255,255,255,0.6)',
};

function UpArrowCircle() {
  return (
    <View style={styles.arrowCircle}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Line x1={12} y1={19} x2={12} y2={5} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
        <Polyline
          points="5 12 12 5 19 12"
          stroke="#fff"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function NotifCard({
  time,
  title,
  body,
}: {
  time: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <LinearGradient
          colors={[C.gradStart, C.purple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.appIcon}
        />
        <Text style={styles.appName}>Split</Text>
        <Text style={styles.cardTime}>{time}</Text>
      </View>
      <Text style={styles.notifTitle}>{title}</Text>
      <Text style={styles.notifBody}>{body}</Text>
    </View>
  );
}

export default function OnboardingNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useOnboardingBack('/onboarding/password');
  const [busy, setBusy] = useState(false);

  const goToPayment = useCallback(async () => {
    await setOnboardingNotificationsStepDone();
    router.push('/onboarding/payment');
  }, [router]);

  const onContinue = useCallback(async () => {
    setBusy(true);
    try {
      let granted = false;
      if (Platform.OS !== 'web') {
        try {
          const { status } = await Notifications.requestPermissionsAsync();
          granted = status === 'granted';
        } catch {
          granted = false;
        }
      }
      if (granted) {
        await saveNotificationPermissionEnabled(true);
      }
      await goToPayment();
    } finally {
      setBusy(false);
    }
  }, [goToPayment]);

  const onNotNow = useCallback(async () => {
    await goToPayment();
  }, [goToPayment]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: C.bg }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + insets.bottom, flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Never miss a payment</Text>
        <Text style={styles.sub}>
          Turn on notifications so you always know when money moves.
        </Text>

        <NotifCard
          time="now"
          title="Alex paid Netflix 🎉"
          body="$7.66 received · you're owed $35.50 total"
        />
        <NotifCard
          time="2h ago"
          title="Netflix bills tomorrow"
          body="Sam hasn't paid yet · send a reminder?"
        />

        <View style={styles.arrowBlock}>
          <UpArrowCircle />
          <Text style={styles.hint}>{'Tap "Allow" on the next screen'}</Text>
        </View>

        <View style={styles.spacer} />

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || busy) && styles.primaryBtnPressed,
            busy && styles.primaryBtnDisabled,
          ]}
          onPress={onContinue}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Continue</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
          onPress={onNotNow}
          disabled={busy}
        >
          <Text style={styles.ghostText}>Not now</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 28 * 1.15,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 15 * 1.5,
    marginBottom: 20,
  },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  appIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  appName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: C.whiteMid,
  },
  cardTime: {
    fontSize: 11,
    color: C.whiteDim,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 3,
  },
  notifBody: {
    fontSize: 13,
    color: C.whiteMuted,
    lineHeight: 13 * 1.4,
  },
  arrowBlock: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
  },
  spacer: {
    flexGrow: 1,
    minHeight: 16,
  },
  primaryBtn: {
    marginTop: 16,
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
  ghostBtn: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  ghostText: {
    fontSize: 14,
    color: C.text,
    textDecorationLine: 'underline',
    textDecorationColor: C.text,
  },
});
