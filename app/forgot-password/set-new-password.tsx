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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';

const C = {
  bg: '#FFFFFF',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  mutedLight: '#B4B2A9',
  inputBg: '#F5F3EE',
  errorRed: '#E24B4A',
  green: '#1D9E75',
};

function resetError(code: string): string {
  switch (code) {
    case 'auth/expired-action-code':
      return 'This reset link has expired. Please request a new one.';
    case 'auth/invalid-action-code':
      return 'This reset link is invalid or has already been used.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters.';
    case 'auth/network-request-failed':
      return 'No internet connection';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function pwChecks(pw: string) {
  return {
    length: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
  };
}

export default function SetNewPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ oobCode?: string; email?: string }>();
  const auth = getFirebaseAuth();

  const oobCode = typeof params.oobCode === 'string' ? params.oobCode : '';
  const hintEmail = typeof params.email === 'string' ? params.email : '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newFocused, setNewFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState('');

  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!oobCode || !auth) {
      router.replace('/forgot-password');
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((em) => setVerifiedEmail(em))
      .catch(() => {
        setError('This password reset link has expired. Please request a new one.');
      });
  }, [oobCode, auth, router]);

  async function handleSetPassword() {
    if (!auth || !oobCode) return;
    setError(null);

    const checks = pwChecks(newPassword);
    if (!checks.length) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      router.replace('/sign-in?passwordReset=1');
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      setError(resetError(code));
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    router.canGoBack() ? router.back() : router.replace('/sign-in');
  }

  const checks = pwChecks(newPassword);
  const canSetPw = newPassword.length >= 8 && newPassword === confirmPassword && !loading;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const newHasError = Boolean(error && !mismatch);
  const confirmHasError = mismatch || error === 'Passwords do not match';

  const displayEmail = verifiedEmail || hintEmail;

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
                <Ionicons name="lock-open-outline" size={24} color={C.purple} />
              </View>
            </View>

            <Text style={styles.title}>Set new password</Text>
            {displayEmail ? (
              <Text style={styles.subtitle}>
                Creating a new password for{'\n'}
                <Text style={styles.emailHighlight}>{displayEmail}</Text>
              </Text>
            ) : (
              <Text style={styles.subtitle}>Choose a strong password for your account.</Text>
            )}

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>New password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  style={[
                    styles.fieldInput,
                    styles.pwInput,
                    newFocused && styles.fieldInputActive,
                    !newFocused && newPassword.length > 0 && styles.fieldInputFilled,
                    newHasError && styles.fieldInputError,
                  ]}
                  placeholder=""
                  placeholderTextColor={C.muted}
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    setError(null);
                  }}
                  secureTextEntry={!showNew}
                  returnKeyType="next"
                  onFocus={() => setNewFocused(true)}
                  onBlur={() => setNewFocused(false)}
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  editable={!loading}
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowNew(!showNew)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showNew ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={newHasError ? C.errorRed : C.muted}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  ref={confirmRef}
                  style={[
                    styles.fieldInput,
                    styles.pwInput,
                    confirmFocused && styles.fieldInputActive,
                    !confirmFocused && confirmPassword.length > 0 && !confirmHasError && styles.fieldInputFilled,
                    confirmHasError && styles.fieldInputError,
                  ]}
                  placeholder=""
                  placeholderTextColor={C.muted}
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    setError(null);
                  }}
                  secureTextEntry={!showConfirm}
                  returnKeyType="done"
                  onFocus={() => setConfirmFocused(true)}
                  onBlur={() => setConfirmFocused(false)}
                  onSubmitEditing={handleSetPassword}
                  editable={!loading}
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowConfirm(!showConfirm)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={confirmHasError ? C.errorRed : C.muted}
                  />
                </Pressable>
              </View>
              {mismatch ? (
                <View style={styles.errorRow}>
                  <Ionicons name="information-circle-outline" size={13} color={C.errorRed} />
                  <Text style={styles.errorTxt}>Passwords do not match</Text>
                </View>
              ) : null}
              {error && !mismatch ? (
                <View style={styles.errorRow}>
                  <Ionicons name="information-circle-outline" size={13} color={C.errorRed} />
                  <Text style={styles.errorTxt}>{error}</Text>
                </View>
              ) : null}
            </View>

            {newPassword.length > 0 ? (
              <View style={styles.strengthList}>
                <StrengthRow met={checks.length} label="At least 8 characters" />
                <StrengthRow met={checks.hasUpper} label="One uppercase letter" />
                <StrengthRow met={checks.hasNumber} label="One number" />
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                !canSetPw && styles.primaryBtnDisabled,
                pressed && canSetPw && { opacity: 0.88 },
              ]}
              onPress={handleSetPassword}
              disabled={!canSetPw}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnTxt}>Set new password</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function StrengthRow({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.strengthRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={met ? C.green : C.mutedLight}
      />
      <Text style={[styles.strengthTxt, met && styles.strengthTxtMet]}>{label}</Text>
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
  emailHighlight: {
    color: C.text,
    fontWeight: '600',
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
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
  strengthList: {
    gap: 6,
    marginBottom: 20,
    marginTop: -2,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  strengthTxt: {
    fontSize: 12,
    color: C.mutedLight,
  },
  strengthTxtMet: {
    color: C.green,
  },
});
