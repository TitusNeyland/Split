import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import type { ApplicationVerifier, Auth, MultiFactorResolver, User } from 'firebase/auth';
import { RecaptchaVerifier } from 'firebase/auth';
import type { FirebaseOptions } from 'firebase/app';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  completeMfaResolverSignIn,
  getPhoneMfaResolver,
  reauthenticateWithEmailPassword,
  startPhoneMfaResolverSms,
  unenrollPhoneMfa,
} from '../../../lib/auth/phoneMfa';

type Props = {
  visible: boolean;
  auth: Auth;
  user: User;
  /** Required on native: embedded verifier must live in this modal so reCAPTCHA WebView is not blocked by a stacked RN Modal. */
  firebaseConfig: FirebaseOptions;
  onClose: () => void;
  onDisabled: () => void;
};

export default function DisableMfaModal({
  visible,
  auth,
  user,
  firebaseConfig,
  onClose,
  onDisabled,
}: Props) {
  const insets = useSafeAreaInsets();
  const localRecaptchaRef = useRef<React.ElementRef<typeof FirebaseRecaptchaVerifierModal>>(null);
  const resolverRef = useRef<MultiFactorResolver | null>(null);
  const [phase, setPhase] = useState<'password' | 'sms'>('password');
  const [password, setPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** SMS send after password + MFA challenge; separate from `busy` because reCAPTCHA/SMS can hang a long time. */
  const [sendingSms, setSendingSms] = useState(false);
  const [webHostReady, setWebHostReady] = useState(false);
  const webVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!visible) {
      setPhase('password');
      setPassword('');
      setSmsCode('');
      setVerificationId(null);
      setBusy(false);
      setSendingSms(false);
      setWebHostReady(false);
      resolverRef.current = null;
      if (webVerifierRef.current) {
        try {
          webVerifierRef.current.clear();
        } catch {
          /* ignore */
        }
        webVerifierRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'split-disable-mfa-recaptcha-host';
    el.style.position = 'fixed';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.left = '-100px';
    document.body.appendChild(el);
    setWebHostReady(true);
    return () => {
      setWebHostReady(false);
      try {
        webVerifierRef.current?.clear();
      } catch {
        /* ignore */
      }
      webVerifierRef.current = null;
      el.remove();
    };
  }, [visible]);

  const getApplicationVerifier = useCallback((): ApplicationVerifier => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') throw new Error('Web document not available.');
      const host = document.getElementById('split-disable-mfa-recaptcha-host');
      if (!host) throw new Error('reCAPTCHA container missing.');
      webVerifierRef.current?.clear();
      webVerifierRef.current = new RecaptchaVerifier(auth, host, { size: 'invisible' });
      return webVerifierRef.current;
    }
    const modal = localRecaptchaRef.current;
    if (!modal) throw new Error('reCAPTCHA is not ready. Restart the app and try again.');
    return modal as unknown as ApplicationVerifier;
  }, [auth]);

  const sendResolverSms = useCallback(
    async (resolver: MultiFactorResolver) => {
      const verifier = getApplicationVerifier();
      return startPhoneMfaResolverSms(auth, resolver, verifier);
    },
    [auth, getApplicationVerifier]
  );

  const submitPassword = useCallback(async () => {
    if (!user.email || !password.trim()) {
      Alert.alert('Password required', 'Enter your current password to disable two-factor authentication.');
      return;
    }
    setBusy(true);
    try {
      await reauthenticateWithEmailPassword(user, user.email, password);
      await unenrollPhoneMfa(user);
      onDisabled();
      onClose();
    } catch (e) {
      const resolver = getPhoneMfaResolver(auth, e);
      if (resolver) {
        resolverRef.current = resolver;
        setBusy(false);
        setSendingSms(true);
        try {
          if (Platform.OS === 'web' && !webHostReady) {
            throw new Error('reCAPTCHA is still initializing. Try again in a moment.');
          }
          const vid = await sendResolverSms(resolver);
          setVerificationId(vid);
          setPhase('sms');
        } catch (inner) {
          const msg = inner instanceof Error ? inner.message : 'Could not send SMS code.';
          Alert.alert('Verification failed', msg);
        } finally {
          setSendingSms(false);
        }
        return;
      }
      const msg = e instanceof Error ? e.message : 'Could not disable 2FA.';
      Alert.alert('Could not disable', msg);
    } finally {
      setBusy(false);
    }
  }, [user, password, auth, webHostReady, sendResolverSms, onDisabled, onClose]);

  const submitSmsAndUnenroll = useCallback(async () => {
    const resolver = resolverRef.current;
    if (!resolver || !verificationId || !smsCode.trim()) {
      Alert.alert('Code required', 'Enter the code from your SMS.');
      return;
    }
    setBusy(true);
    try {
      await completeMfaResolverSignIn(resolver, verificationId, smsCode);
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in.');
      await unenrollPhoneMfa(u);
      onDisabled();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not disable 2FA.';
      Alert.alert('Could not disable', msg);
    } finally {
      setBusy(false);
    }
  }, [verificationId, smsCode, auth, onDisabled, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => !busy && onClose()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.mfaOverlay}
      >
        <Pressable style={styles.mfaBackdrop} onPress={() => !busy && onClose()} />
        <View style={[styles.mfaSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.mfaTitle}>Disable two-factor authentication</Text>
          {phase === 'password' ? (
            <>
              <Text style={styles.mfaSub}>Enter your current password to confirm.</Text>
              {sendingSms ? (
                <Text style={styles.mfaHint}>Sending verification text… complete any reCAPTCHA if prompted.</Text>
              ) : null}
              <TextInput
                style={styles.mfaInput}
                placeholder="Password"
                placeholderTextColor="#aaa"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!busy && !sendingSms}
                autoCapitalize="none"
              />
              <Pressable
                style={[styles.mfaPrimary, busy && { opacity: 0.7 }]}
                onPress={() => void submitPassword()}
                disabled={busy || sendingSms}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : sendingSms ? (
                  <Text style={styles.mfaPrimaryTxt}>Sending code…</Text>
                ) : (
                  <Text style={styles.mfaPrimaryTxt}>Continue</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.mfaSub}>Enter the verification code we sent to your phone.</Text>
              <TextInput
                style={styles.mfaInput}
                placeholder="6-digit code"
                placeholderTextColor="#aaa"
                keyboardType="number-pad"
                value={smsCode}
                onChangeText={setSmsCode}
                editable={!busy}
              />
              <Pressable
                style={[styles.mfaPrimary, busy && { opacity: 0.7 }]}
                onPress={() => void submitSmsAndUnenroll()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.mfaPrimaryTxt}>Turn off 2FA</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.mfaLink}
                onPress={() => {
                  setPhase('password');
                  setSmsCode('');
                  setVerificationId(null);
                  resolverRef.current = null;
                }}
                disabled={busy}
              >
                <Text style={styles.mfaLinkTxt}>Back</Text>
              </Pressable>
            </>
          )}
          <Pressable style={styles.mfaCancel} onPress={() => !busy && onClose()} disabled={busy}>
            <Text style={styles.mfaCancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {/*
        Own verifier inside this Modal: the root _layout verifier sits *under* this RN Modal and the
        invisible WebView often never loads. Keep a small top-left slot (matches expo invisible size)
        so we do not cover the bottom sheet; box-none lets taps reach backdrop/sheet outside the WebView.
      */}
      {Platform.OS !== 'web' ? (
        <View style={styles.recaptchaCorner} pointerEvents="box-none">
          <FirebaseRecaptchaVerifierModal
            ref={localRecaptchaRef}
            firebaseConfig={firebaseConfig}
            attemptInvisibleVerification
            title="Verify phone"
          />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  mfaOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  /** Top-left: same footprint expo uses for invisible WebView; avoids covering the sheet. */
  recaptchaCorner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 300,
    height: 300,
    zIndex: 5,
    elevation: 5,
  },
  mfaBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  mfaSheet: {
    backgroundColor: '#F2F0EB',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  mfaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
    marginBottom: 8,
  },
  mfaSub: {
    fontSize: 14,
    color: '#888780',
    marginBottom: 14,
  },
  mfaHint: {
    fontSize: 13,
    color: '#534AB7',
    marginBottom: 12,
    lineHeight: 18,
  },
  mfaInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  mfaPrimary: {
    backgroundColor: '#534AB7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  mfaPrimaryTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  mfaLink: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  mfaLinkTxt: {
    color: '#534AB7',
    fontSize: 15,
    fontWeight: '600',
  },
  mfaCancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  mfaCancelTxt: {
    color: '#888780',
    fontSize: 16,
    fontWeight: '600',
  },
});
