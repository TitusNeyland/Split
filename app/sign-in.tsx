import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as LocalAuthentication from 'expo-local-authentication';
import { getFirebaseAuth } from '../lib/firebase';
import { signInWithEmail, signInWithApple } from '../lib/auth/authProviders';
import { setOnboardingCompleteInStorage } from '../lib/onboarding/onboardingStorage';

WebBrowser.maybeCompleteAuthSession();

const C = {
  bg: '#FFFFFF',
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  mutedLight: '#B4B2A9',
  inputBg: '#F5F3EE',
  border: '#534AB7',
  divider: '#E8E6E1',
  errorRed: '#E24B4A',
  errorBg: '#FCEBEB',
  errorDark: '#A32D2D',
  green: '#1D9E75',
  greenBg: '#E1F5EE',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Toast hook
// ---------------------------------------------------------------------------
function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<'green' | 'dark'>('dark');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(msg: string, v: 'green' | 'dark' = 'dark') {
    if (timer.current) clearTimeout(timer.current);
    setMessage(msg);
    setVariant(v);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        () => setMessage(null)
      );
    }, 3500);
  }

  return { message, variant, opacity, show };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ passwordReset?: string }>();
  const auth = getFirebaseAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Show success toast if returning from password reset
  useEffect(() => {
    if (params.passwordReset === '1') {
      toast.show('Password reset successfully — sign in below', 'green');
    }
  }, []);

  // Autofocus email on mount
  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  /** Sign up must go to onboarding, not `/` — index sends completed users back to sign-in. */
  const goToSignUp = useCallback(async () => {
    await setOnboardingCompleteInStorage(false);
    router.replace('/onboarding');
  }, [router]);

  // Google OAuth
  const [request, response, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri: makeRedirectUri({ useProxy: true }),
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const { id_token } = response.params;
    if (!auth || !id_token) return;
    setLoading(true);
    const credential = GoogleAuthProvider.credential(id_token);
    signInWithCredential(auth, credential)
      .then(() => router.replace('/'))
      .catch((e) => toast.show(socialError(e)))
      .finally(() => setLoading(false));
  }, [response]);

  function validateEmail(): boolean {
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter a valid email address');
      return false;
    }
    return true;
  }

  async function handleSignIn() {
    if (!auth) return;
    setError(null);
    if (!validateEmail()) return;
    setLoading(true);
    try {
      await signInWithEmail(auth, email.trim(), password);
      router.replace('/');
    } catch (e: any) {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      setError(signInError(e?.code, next));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    if (!auth) return;
    setLoading(true);
    try {
      await signInWithApple(auth);
      router.replace('/');
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        toast.show(socialError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFaceId() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to mySplit',
        fallbackLabel: 'Use password',
      });
      if (result.success) router.replace('/');
    } catch {
      // biometric not available
    }
  }

  const hasError = Boolean(error);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;
  const showWarningBanner = failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS;

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
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your mySplit account.</Text>

            {/* Email field */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Email address</Text>
              <TextInput
                ref={emailRef}
                style={[
                  styles.fieldInput,
                  emailFocused && styles.fieldInputActive,
                  !emailFocused && email.length > 0 && styles.fieldInputFilled,
                  error === 'Enter a valid email address' && styles.fieldInputError,
                ]}
                placeholder=""
                placeholderTextColor={C.muted}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(null); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
              />
            </View>

            {/* Password field */}
            <View style={[styles.fieldWrap, { marginBottom: 4 }]}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  ref={passwordRef}
                  style={[
                    styles.fieldInput,
                    styles.pwInput,
                    passwordFocused && styles.fieldInputActive,
                    !passwordFocused && password.length > 0 && styles.fieldInputFilled,
                    hasError && styles.fieldInputError,
                  ]}
                  placeholder=""
                  placeholderTextColor={C.muted}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(null); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  onSubmitEditing={handleSignIn}
                  editable={!loading}
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={hasError ? C.errorRed : C.muted}
                  />
                </Pressable>
              </View>

              {/* Inline error */}
              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="information-circle-outline" size={13} color={C.errorRed} />
                  <Text style={styles.errorTxt}>{error}</Text>
                </View>
              ) : null}
            </View>

            {/* Forgot password */}
            <Pressable
              style={({ pressed }) => [styles.forgotBtn, pressed && { opacity: 0.6 }]}
              onPress={() => {
                const e = email.trim();
                if (e) {
                  router.push({ pathname: '/forgot-password', params: { email: e } });
                } else {
                  router.push('/forgot-password');
                }
              }}
            >
              <Text style={styles.forgotTxt}>Forgot password?</Text>
            </Pressable>

            {/* Sign in button */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                !canSubmit && styles.primaryBtnDisabled,
                pressed && canSubmit && { opacity: 0.88 },
              ]}
              onPress={handleSignIn}
              disabled={!canSubmit}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnTxt}>
                  {failedAttempts > 0 ? 'Try again' : 'Sign in'}
                </Text>
              )}
            </Pressable>

            {/* Warning banner after failed attempt */}
            {showWarningBanner && (
              <View style={styles.warningBanner}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={C.errorDark}
                  style={{ marginTop: 1, flexShrink: 0 }}
                />
                <Text style={styles.warningTxt}>
                  After {MAX_ATTEMPTS} failed attempts your account will be locked for 30 minutes.
                </Text>
              </View>
            )}

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerTxt}>
                {failedAttempts > 0 ? 'or' : 'or continue with'}
              </Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Face ID (shown after failed attempt) */}
            {failedAttempts > 0 && (
              <Pressable
                style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.8 }]}
                onPress={handleFaceId}
              >
                <Ionicons name="lock-closed-outline" size={16} color={C.text} />
                <Text style={styles.outlineBtnTxt}>Use Face ID instead</Text>
              </Pressable>
            )}

            {/* Apple */}
            {failedAttempts === 0 && Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleBtn}
                onPress={handleApple}
              />
            )}

            {/* Google */}
            {failedAttempts === 0 && (
              <Pressable
                style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.8 }]}
                onPress={() => promptGoogleAsync()}
                disabled={loading || !request}
                accessibilityRole="button"
              >
                {/* Google G color logo */}
                <View style={styles.googleG}>
                  <Text style={styles.googleGBlue}>G</Text>
                </View>
                <Text style={styles.socialBtnTxt}>Sign in with Google</Text>
              </Pressable>
            )}

            {/* Sign up link */}
            <Pressable
              style={({ pressed }) => [styles.signUpBtn, pressed && { opacity: 0.6 }]}
              onPress={goToSignUp}
            >
              <Text style={styles.signUpTxt}>
                Don't have an account?{' '}
                <Text style={styles.signUpLink}>Sign up</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Toast */}
      {toast.message ? (
        <Animated.View
          style={[
            styles.toast,
            { bottom: insets.bottom + 20, opacity: toast.opacity },
            toast.variant === 'green' && styles.toastGreen,
          ]}
        >
          <Ionicons
            name={toast.variant === 'green' ? 'checkmark' : 'alert-circle-outline'}
            size={16}
            color="#fff"
          />
          <Text style={styles.toastTxt}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function signInError(code: string, attempts: number): string {
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return remaining > 0
        ? `Incorrect password · ${remaining} attempt${remaining === 1 ? '' : 's'} remaining`
        : 'Incorrect password · too many attempts';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/too-many-requests':
      return 'Account temporarily locked · try again later or reset your password';
    case 'auth/network-request-failed':
      return 'No internet connection';
    case 'auth/invalid-email':
      return 'Enter a valid email address';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function socialError(e: unknown): string {
  const code = (e as any)?.code ?? '';
  switch (code) {
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email.';
    case 'auth/network-request-failed':
      return 'No internet connection.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {},

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
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
    borderColor: C.border,
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

  pwWrap: {
    position: 'relative',
  },
  pwInput: {
    paddingRight: 46,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
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

  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: 4,
  },
  forgotTxt: {
    fontSize: 12,
    color: C.purple,
    fontWeight: '500',
  },

  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.errorBg,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  warningTxt: {
    fontSize: 12,
    color: C.errorDark,
    lineHeight: 18,
    flex: 1,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: C.divider,
  },
  dividerTxt: {
    fontSize: 12,
    color: C.mutedLight,
    fontWeight: '500',
  },

  outlineBtn: {
    width: '100%',
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: '#D3D1C7',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  outlineBtnTxt: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },

  appleBtn: {
    height: 50,
    width: '100%',
    marginBottom: 10,
    borderRadius: 14,
  },
  socialBtn: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.inputBg,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  socialBtnTxt: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },
  googleG: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGBlue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },

  signUpBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  signUpTxt: {
    fontSize: 13,
    color: C.muted,
  },
  signUpLink: {
    color: C.purple,
    fontWeight: '500',
  },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#1a1a18',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastGreen: {
    backgroundColor: C.green,
  },
  toastTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});
