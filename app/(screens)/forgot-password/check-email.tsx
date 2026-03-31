import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '../../../lib/firebase';
import { Toast, type ToastType } from '../../components/shared/Toast';

const C = {
  bg: '#FFFFFF',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  mutedLight: '#B4B2A9',
  errorRed: '#E24B4A',
  green: '#1D9E75',
};

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

export default function ForgotPasswordCheckEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const auth = getFirebaseAuth();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastType>('info');
  const showToast = useCallback((msg: string, v: 'green' | 'dark' = 'dark') => {
    setToastType(v === 'green' ? 'success' : 'info');
    setToastMsg(msg);
  }, []);

  const email = typeof params.email === 'string' ? params.email.trim() : '';

  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!email) {
      router.replace('/forgot-password');
    }
  }, [email, router]);

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  function startCountdown(seconds = 60) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setResendCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setResendCountdown((v) => {
        if (v <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    if (!auth || resendCountdown > 0 || !email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Reset link resent!', 'green');
      startCountdown(60);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      showToast(sendErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  function formatCountdown(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  if (!email) {
    return null;
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
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/forgot-password'))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </Pressable>
          </View>

          <View style={[styles.content, styles.contentCentered]}>
            <View style={styles.emailIconOuter}>
              <Ionicons name="mail-outline" size={36} color={C.purple} />
            </View>

            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a reset link to{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>

            <View style={styles.resendRow}>
              <Text style={styles.resendTxt}>Didn't get it?</Text>
              {resendCountdown > 0 ? (
                <Text style={styles.resendCountdown}>Resend in {formatCountdown(resendCountdown)}</Text>
              ) : (
                <Pressable onPress={handleResend} disabled={loading} hitSlop={8}>
                  <Text style={[styles.resendLink, loading && { opacity: 0.5 }]}>Resend link</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
              onPress={() => router.replace('/sign-in')}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnTxt}>Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {loading ? (
        <View style={[styles.loadingOverlay, { paddingBottom: insets.bottom + 24 }]}>
          <ActivityIndicator color={C.purple} />
        </View>
      ) : null}

      <Toast
        message={toastMsg}
        onDismiss={() => setToastMsg(null)}
        duration={3000}
        type={toastType}
        showIcon
        bottomInsetExtra={20}
      />
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
  contentCentered: {
    alignItems: 'center',
    textAlign: 'center',
  },
  emailIconOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  emailHighlight: {
    color: C.text,
    fontWeight: '600',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  resendTxt: {
    fontSize: 13,
    color: C.muted,
  },
  resendLink: {
    fontSize: 13,
    color: C.purple,
    fontWeight: '500',
  },
  resendCountdown: {
    fontSize: 13,
    color: C.mutedLight,
    fontWeight: '500',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
  },
  primaryBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    pointerEvents: 'none',
  },
});
