import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '../../../lib/firebase';

const C = {
  bg: '#FFFFFF',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  inputBg: '#F5F3EE',
  errorRed: '#E24B4A',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sendErrorMessage(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email address';
    case 'auth/invalid-email':
      return 'Enter a valid email address';
    case 'auth/too-many-requests':
      return 'Too many requests · try again later';
    case 'auth/network-request-failed':
      return 'No internet connection';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ oobCode?: string; mode?: string; email?: string }>();

  const oobCode = typeof params.oobCode === 'string' ? params.oobCode : '';
  const mode = typeof params.mode === 'string' ? params.mode : '';
  const prefillEmail = typeof params.email === 'string' ? params.email : '';
  const auth = getFirebaseAuth();

  if (mode === 'resetPassword' && oobCode) {
    return (
      <Redirect
        href={{
          pathname: '/forgot-password/set-new-password',
          params: { oobCode, ...(prefillEmail ? { email: prefillEmail } : {}) },
        }}
      />
    );
  }

  const [email, setEmail] = useState(prefillEmail);
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  async function handleSendReset() {
    if (!auth) return;
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter a valid email address');
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      router.push({
        pathname: '/forgot-password/check-email',
        params: { email: trimmed },
      });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      setError(sendErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    router.canGoBack() ? router.back() : router.replace('/sign-in');
  }

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.backRow}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
              onPress={handleBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.iconWrap}>
              <View style={styles.lockIconSquare}>
                <Ionicons name="lock-closed-outline" size={24} color={C.purple} />
              </View>
            </View>

            <Text style={styles.title}>Forgot your password?</Text>
            <Text style={styles.subtitle}>
              No worries — enter your email and we'll send you a reset link.
            </Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Email address</Text>
              <TextInput
                ref={emailRef}
                style={[
                  styles.fieldInput,
                  emailFocused && styles.fieldInputActive,
                  !emailFocused && email.length > 0 && styles.fieldInputFilled,
                  error && styles.fieldInputError,
                ]}
                placeholder=""
                placeholderTextColor={C.muted}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="done"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmitEditing={handleSendReset}
                editable={!loading}
              />
              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="information-circle-outline" size={13} color={C.errorRed} />
                  <Text style={styles.errorTxt}>{error}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                loading && styles.primaryBtnLoading,
                pressed && !loading && { opacity: 0.88 },
              ]}
              onPress={handleSendReset}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <View style={styles.sendingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.primaryBtnTxt}>Sending…</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnTxt}>Send reset link</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.6 }]}
              onPress={() => router.replace('/sign-in')}
              accessibilityRole="button"
            >
              <Text style={styles.ghostBtnTxt}>Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {},
  backRow: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  iconWrap: {
    marginBottom: 18,
  },
  lockIconSquare: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 22,
    marginBottom: 24,
  },
  fieldWrap: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 5,
  },
  fieldInput: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
    fontSize: 16,
    color: C.text,
  },
  fieldInputActive: {
    borderColor: C.purple,
    backgroundColor: '#fff',
  },
  fieldInputFilled: {
    borderColor: 'transparent',
    backgroundColor: C.inputBg,
  },
  fieldInputError: {
    borderColor: C.errorRed,
    backgroundColor: '#fff',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  errorTxt: {
    fontSize: 12,
    color: C.errorRed,
    flex: 1,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnLoading: {
    opacity: 1,
  },
  primaryBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ghostBtn: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  ghostBtnTxt: {
    fontSize: 14,
    color: C.muted,
  },
});
