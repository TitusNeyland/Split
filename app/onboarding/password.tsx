import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { useOnboardingBack } from '../../lib/useOnboardingBack';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import {
  createOrLinkOnboardingEmailPassword,
  mergeOnboardingUserDocAfterSignup,
  readStoredSignupEmail,
} from '../../lib/onboardingAccount';
import {
  commitPendingBiometricToEnabledFlag,
  setOnboardingPasswordSaved,
} from '../../lib/onboardingStorage';

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  inputBg: '#F5F3EE',
  green: '#1D9E75',
  errorRed: '#E24B4A',
  checkBorder: '#D3D1C7',
};

type Strength = {
  id: string;
  label: string;
  test: (p: string) => boolean;
};

const STRENGTH: readonly Strength[] = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: '1 lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: '1 uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'num', label: '1 number', test: (p) => /\d/.test(p) },
];

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
          stroke="#888780"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={12} cy={12} r={3} stroke="#888780" strokeWidth={1.5} />
      </Svg>
    );
  }
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
        stroke="#888780"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M1 1l22 22"
        stroke="#888780"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckRow({ label, met }: { label: string; met: boolean }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkCircle, met && styles.checkCircleMet]}>
        {met ? (
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Polyline
              points="20 6 9 17 4 12"
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <Text style={[styles.checkLabel, met && styles.checkLabelMet]}>{label}</Text>
    </View>
  );
}

function PasswordsMatchRow({ passwordsMatch, showMismatch }: { passwordsMatch: boolean; showMismatch: boolean }) {
  return (
    <View style={styles.checkRow}>
      <View
        style={[
          styles.checkCircle,
          passwordsMatch && styles.checkCircleMet,
          showMismatch && styles.checkCircleMismatch,
        ]}
      >
        {passwordsMatch ? (
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Polyline
              points="20 6 9 17 4 12"
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : showMismatch ? (
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Path
              d="M18 6L6 18M6 6l12 12"
              stroke="#fff"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <Text
        style={[
          styles.checkLabel,
          passwordsMatch && styles.checkLabelMet,
          showMismatch && styles.checkLabelMismatch,
        ]}
      >
        Passwords match
      </Text>
    </View>
  );
}

export default function OnboardingPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useOnboardingBack('/onboarding/email');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signupEmail, setSignupEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const e = await readStoredSignupEmail();
      if (alive) setSignupEmail(e);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hasMinLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && confirmPassword === password;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const allChecksPassed = useMemo(
    () =>
      hasMinLength &&
      hasLower &&
      hasUpper &&
      hasNumber &&
      passwordsMatch,
    [hasMinLength, hasLower, hasUpper, hasNumber, passwordsMatch]
  );

  const onContinue = useCallback(async () => {
    if (!allChecksPassed) return;
    if (!isFirebaseConfigured() || !getFirebaseAuth()) {
      Alert.alert('Setup required', 'Firebase is not configured.');
      return;
    }
    const email = signupEmail?.trim();
    if (!email) {
      Alert.alert('Missing email', 'Go back and enter your email again.');
      return;
    }

    setSaving(true);
    try {
      const user = await createOrLinkOnboardingEmailPassword(email, password);
      await mergeOnboardingUserDocAfterSignup(user.uid);
      await commitPendingBiometricToEnabledFlag();
      await setOnboardingPasswordSaved();
      router.push('/onboarding/notifications');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const code = typeof err.code === 'string' ? err.code : '';
      if (__DEV__) {
        console.warn('[onboarding password]', code || '(no code)', err.message ?? e);
      }
      if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
        Alert.alert(
          'Email in use',
          'An account with this email already exists. Sign in instead.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Sign in', onPress: () => router.replace('/sign-in') },
          ]
        );
      } else if (code === 'auth/weak-password') {
        Alert.alert('Weak password', 'Choose a stronger password.');
      } else if (code === 'auth/network-request-failed') {
        Alert.alert(
          'No connection',
          'Check your internet connection and try again.'
        );
      } else if (code === 'auth/operation-not-allowed') {
        Alert.alert(
          'Sign-in not enabled',
          'Enable Email/Password in the Firebase Console (Authentication → Sign-in method).'
        );
      } else if (code === 'auth/invalid-email') {
        Alert.alert('Invalid email', 'Go back and enter a valid email address.');
      } else if (code === 'auth/invalid-credential') {
        Alert.alert(
          'Could not link account',
          'This email may already be in use. Try signing in, or use a different email.'
        );
      } else if (code === 'permission-denied') {
        Alert.alert(
          'Could not save profile',
          'Your account may have been created, but saving your profile failed (Firestore rules). Check the console in development.'
        );
      } else if (code === 'auth/internal-error') {
        Alert.alert(
          'Authentication error',
          'Something went wrong on the server. Try again in a moment.'
        );
      } else if (code === 'auth/onboarding-session-mismatch') {
        Alert.alert(
          'Different account',
          'You are signed in with another email. Sign out from the sign-in screen, then continue onboarding.'
        );
      } else {
        Alert.alert(
          'Could not create account',
          code
            ? `Error: ${code}. Check the Metro/console logs for details.`
            : 'Check your connection and try again. If this keeps happening, open the console (dev) for the error code.'
        );
      }
    } finally {
      setSaving(false);
    }
  }, [allChecksPassed, signupEmail, password, router]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
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
          <Text style={styles.title}>Set your password</Text>
          <Text style={styles.sub}>Create a secure password for your account.</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>New password</Text>
            <View style={styles.pwWrap}>
              <TextInput
                style={styles.pwInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!saving}
              />
              <Pressable
                style={styles.eyeHit}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon visible={showPassword} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.fieldBlock, styles.fieldBlockBeforeChecklist]}>
            <Text style={styles.fieldLabel}>Confirm password</Text>
            <View style={styles.pwWrap}>
              <TextInput
                style={styles.pwInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!saving}
              />
              <Pressable
                style={styles.eyeHit}
                onPress={() => setShowConfirmPassword((v) => !v)}
                hitSlop={8}
                accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                <EyeIcon visible={showConfirmPassword} />
              </Pressable>
            </View>
          </View>

          <View style={styles.checklist}>
            {STRENGTH.map((s) => (
              <CheckRow key={s.id} label={s.label} met={s.test(password)} />
            ))}
            <PasswordsMatchRow passwordsMatch={passwordsMatch} showMismatch={showMismatch} />
          </View>

          <View style={styles.spacer} />

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!allChecksPassed || saving) && styles.primaryBtnDisabled,
              pressed && allChecksPassed && !saving && styles.primaryBtnPressed,
            ]}
            onPress={onContinue}
            disabled={!allChecksPassed || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    backgroundColor: C.bg,
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
  scroll: { flex: 1 },
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
  fieldBlock: {
    marginBottom: 16,
  },
  fieldBlockBeforeChecklist: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 5,
  },
  pwWrap: {
    position: 'relative',
  },
  pwInput: {
    width: '100%',
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 44,
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: C.purple,
    borderRadius: 14,
    fontSize: 16,
    color: C.text,
  },
  eyeHit: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklist: {
    gap: 7,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.checkBorder,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleMet: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  checkCircleMismatch: {
    backgroundColor: C.errorRed,
    borderColor: C.errorRed,
  },
  checkLabel: {
    fontSize: 13,
    color: C.text,
  },
  checkLabelMet: {
    color: C.green,
  },
  checkLabelMismatch: {
    color: C.errorRed,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 24,
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
  primaryBtnDisabled: {
    opacity: 0.45,
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
