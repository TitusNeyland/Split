import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getFirebaseAuth } from '../../lib/firebase';
import { markOnboardingFullyComplete } from '../../lib/onboardingStorage';

/** Step 9 — celebration; primary action finishes onboarding and enters the app. */
export default function OnboardingCompleteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onGetStarted = useCallback(async () => {
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await markOnboardingFullyComplete(auth?.currentUser?.uid ?? null);
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.body}>
        <Text style={styles.title}>You&apos;re all set!</Text>
        <Text style={styles.sub}>
          Time to add your first subscription and stop chasing people for money.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || busy) && styles.primaryBtnPressed,
            busy && styles.primaryBtnDisabled,
          ]}
          onPress={onGetStarted}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Get started</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const C = {
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 32,
  },
  primaryBtn: {
    width: '100%',
    maxWidth: 400,
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
});
