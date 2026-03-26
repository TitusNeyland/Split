import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingBack } from './useOnboardingBack';
import { Ionicons } from '@expo/vector-icons';

/**
 * Step 5 — password (full form in a follow-up).
 * After `createUserWithEmailAndPassword` / credential link, call
 * `commitPendingBiometricToEnabledFlag()` from `lib/onboardingStorage` so the email-step Face ID
 * choice is copied to AsyncStorage `@split/biometric_enabled`.
 */
export default function OnboardingPasswordScreen() {
  const insets = useSafeAreaInsets();
  const goBack = useOnboardingBack('/onboarding/email');

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color="#1a1a18" />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Set your password</Text>
        <Text style={styles.sub}>Create a secure password for your account.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a18',
    letterSpacing: -0.5,
    lineHeight: 28 * 1.15,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: '#888780',
    lineHeight: 15 * 1.5,
  },
});
