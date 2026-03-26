import React, { useCallback, useMemo, useState } from 'react';
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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useOnboardingBack } from './useOnboardingBack';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { fetchSignInMethodsForEmail } from 'firebase/auth';
import Svg, { Polyline } from 'react-native-svg';
import { buildSingleLegalSectionHtml, LEGAL_SECTIONS } from '../../constants/legalContent';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import {
  setOnboardingBiometricPending,
  setOnboardingEmailSaved,
} from '../../lib/onboardingStorage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  inputBg: '#F5F3EE',
  divider: '#F0EEE9',
  checkBorder: '#D3D1C7',
  errorRed: '#E24B4A',
};

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="20 6 9 17 4 12"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type LegalPane = 'terms' | 'privacy' | null;

export default function OnboardingEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useOnboardingBack('/onboarding/name');
  const [email, setEmail] = useState('');
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [faceIdEnabled, setFaceIdEnabled] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [legalPane, setLegalPane] = useState<LegalPane>(null);

  const trimmed = email.trim();
  const formatValid = EMAIL_REGEX.test(trimmed);
  const showFormatError = trimmed.length > 0 && !formatValid && emailBlurred;

  const biometricTitle = Platform.OS === 'ios' ? 'Enable Face ID' : 'Enable biometrics';

  const canSubmit = useMemo(
    () => formatValid && termsAccepted && !checkingEmail,
    [formatValid, termsAccepted, checkingEmail]
  );

  const onEmailChange = useCallback((t: string) => {
    setEmail(t);
    setEmailExists(false);
  }, []);

  const openLegal = useCallback((pane: 'terms' | 'privacy') => {
    setLegalPane(pane);
  }, []);

  const onContinue = useCallback(async () => {
    setEmailBlurred(true);
    if (!formatValid || !termsAccepted) return;

    if (!isFirebaseConfigured()) {
      Alert.alert('Setup required', 'Firebase is not configured.');
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      Alert.alert('Setup required', 'Firebase is not configured.');
      return;
    }

    setCheckingEmail(true);
    setEmailExists(false);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, trimmed);
      if (methods.length > 0) {
        setEmailExists(true);
        return;
      }
      await setOnboardingBiometricPending(faceIdEnabled);
      await setOnboardingEmailSaved();
      router.push('/onboarding/password');
    } catch {
      Alert.alert('Something went wrong', 'Check your connection and try again.');
    } finally {
      setCheckingEmail(false);
    }
  }, [formatValid, termsAccepted, trimmed, faceIdEnabled, router]);

  const legalHtml =
    legalPane != null ? buildSingleLegalSectionHtml(legalPane) : '';

  const legalScrollBody =
    legalPane != null
      ? LEGAL_SECTIONS.find((s) => s.id === legalPane)
      : undefined;

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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>What's your email?</Text>
          <Text style={styles.sub}>This will be your login to Split.</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={onEmailChange}
              onBlur={() => setEmailBlurred(true)}
              style={[
                styles.input,
                (showFormatError || emailExists) && styles.inputError,
              ]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!checkingEmail}
            />
          </View>

          {showFormatError ? (
            <Text style={styles.inlineError}>Enter a valid email address</Text>
          ) : null}

          {emailExists ? (
            <View style={styles.existsRow}>
              <Text style={styles.existsText}>
                An account with this email already exists ·{' '}
              </Text>
              <Pressable onPress={() => router.replace('/sign-in')} hitSlop={6}>
                <Text style={styles.existsLink}>sign in instead</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.faceRow, pressed && { opacity: 0.85 }]}
            onPress={() => setFaceIdEnabled((v) => !v)}
          >
            <View
              style={[
                styles.faceCheckbox,
                !faceIdEnabled && styles.faceCheckboxOff,
              ]}
            >
              {faceIdEnabled ? <CheckIcon color="#fff" /> : null}
            </View>
            <View style={styles.faceTextCol}>
              <Text style={styles.faceTitle}>{biometricTitle}</Text>
              <Text style={styles.faceSub}>Skip typing your password every time</Text>
            </View>
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.termsRow}>
            <Pressable
              onPress={() => setTermsAccepted((v) => !v)}
              hitSlop={8}
              style={styles.termsCheckboxHit}
            >
              <View
                style={[
                  styles.termsCheckbox,
                  termsAccepted && styles.termsCheckboxOn,
                ]}
              >
                {termsAccepted ? <CheckIcon color="#fff" /> : null}
              </View>
            </Pressable>
            <View style={styles.termsTextWrap}>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text
                  onPress={() => openLegal('terms')}
                  style={styles.termsLink}
                >
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text
                  onPress={() => openLegal('privacy')}
                  style={styles.termsLink}
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSubmit || checkingEmail) && styles.primaryBtnDisabled,
              pressed && canSubmit && !checkingEmail && styles.primaryBtnPressed,
            ]}
            onPress={onContinue}
            disabled={!canSubmit || checkingEmail}
          >
            {checkingEmail ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>

      <Modal
        visible={legalPane != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalPane(null)}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setLegalPane(null)}
              hitSlop={12}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>
          {legalPane != null && Platform.OS === 'web' ? (
            <ScrollView style={styles.modalWebScroll} contentContainerStyle={styles.modalWebPad}>
              {legalScrollBody ? (
                <>
                  <Text style={styles.modalWebTitle}>{legalScrollBody.title}</Text>
                  {legalScrollBody.paragraphs.map((p, i) => (
                    <Text key={i} style={styles.modalWebP}>
                      {p}
                    </Text>
                  ))}
                </>
              ) : null}
            </ScrollView>
          ) : legalPane != null ? (
            <WebView
              originWhitelist={['*']}
              source={{ html: legalHtml, baseUrl: 'https://localhost' }}
              style={styles.webView}
            />
          ) : null}
        </View>
      </Modal>
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
    marginBottom: 24,
  },
  fieldWrap: {
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 5,
  },
  input: {
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: C.text,
  },
  inputError: {
    borderColor: C.errorRed,
    backgroundColor: C.bg,
  },
  inlineError: {
    fontSize: 13,
    color: C.errorRed,
    marginBottom: 12,
    marginTop: 2,
  },
  existsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  existsText: {
    fontSize: 13,
    color: C.text,
    fontWeight: '500',
  },
  existsLink: {
    fontSize: 13,
    fontWeight: '600',
    color: C.purple,
    textDecorationLine: 'underline',
    textDecorationColor: C.purple,
  },
  faceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingRight: 4,
  },
  faceCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: C.purple,
    borderWidth: 1.5,
    borderColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  faceCheckboxOff: {
    backgroundColor: C.bg,
    borderColor: C.checkBorder,
  },
  faceTextCol: {
    flex: 1,
  },
  faceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  faceSub: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
    lineHeight: 11 * 1.45,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginBottom: 12,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 8,
  },
  termsCheckboxHit: {
    paddingTop: 2,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.checkBorder,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsCheckboxOn: {
    backgroundColor: C.purple,
    borderColor: C.purple,
  },
  termsTextWrap: {
    flex: 1,
    paddingTop: 1,
  },
  termsText: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 12 * 1.5,
  },
  termsLink: {
    color: C.purple,
    textDecorationLine: 'underline',
    textDecorationColor: C.purple,
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
  modalRoot: {
    flex: 1,
    backgroundColor: C.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  modalClose: {
    fontSize: 17,
    fontWeight: '600',
    color: C.purple,
  },
  webView: {
    flex: 1,
  },
  modalWebScroll: {
    flex: 1,
  },
  modalWebPad: {
    padding: 20,
    paddingBottom: 40,
  },
  modalWebTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 12,
  },
  modalWebP: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginBottom: 12,
  },
});
