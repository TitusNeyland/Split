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
import type { ApplicationVerifier, Auth, User } from 'firebase/auth';
import { RecaptchaVerifier } from 'firebase/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  completePhoneMfaEnrollment,
  startPhoneMfaEnrollment,
} from '../../../lib/auth/phoneMfa';
import { useFirebaseRecaptchaRef } from '../../contexts/FirebaseRecaptchaContext';
import type { FirebaseOptions } from 'firebase/app';

type Props = {
  visible: boolean;
  auth: Auth;
  user: User;
  firebaseConfig: FirebaseOptions;
  onClose: () => void;
  onEnrolled: () => void;
};

/** US +1 NANP: display as "+1 601-954-9253"; submit as E.164. */
function formatUsMfaPhoneFromInput(text: string): string {
  let d = text.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('1')) d = d.slice(0, 11);
  if (d.length > 10 && !d.startsWith('1')) d = d.slice(0, 10);

  if (d.length === 0 || d === '1') return '+1 ';

  let national = '';
  if (d.startsWith('1') && d.length > 1) national = d.slice(1, 11);
  else if (d.length <= 10 && d[0] !== '1') national = d.slice(0, 10);
  else if (d.length === 11 && d[0] === '1') national = d.slice(1);
  else national = d.slice(0, 10);

  national = national.slice(0, 10);
  if (national.length === 0) return '+1 ';

  let out = '+1 ';
  if (national.length <= 3) out += national;
  else if (national.length <= 6) out += `${national.slice(0, 3)}-${national.slice(3)}`;
  else out += `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`;
  return out;
}

function normalizeE164(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
}

export default function MfaPhoneEnrollmentModal({
  visible,
  auth,
  user,
  firebaseConfig,
  onClose,
  onEnrolled,
}: Props) {
  const insets = useSafeAreaInsets();
  const recaptchaRef = useFirebaseRecaptchaRef();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+1 ');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webHostReady, setWebHostReady] = useState(false);
  const webVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep('phone');
      setPhone('+1 ');
      setCode('');
      setVerificationId(null);
      setBusy(false);
      setWebHostReady(false);
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
    el.id = 'split-mfa-recaptcha-host';
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

  const sendCode = useCallback(async () => {
    const e164 = normalizeE164(phone);
    if (!e164) {
      Alert.alert('Phone number', 'Enter a valid US number (e.g. +1 601-954-9253).');
      return;
    }
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') throw new Error('Web document not available.');
        if (!webHostReady) throw new Error('reCAPTCHA is still initializing. Try again in a moment.');
        const host = document.getElementById('split-mfa-recaptcha-host');
        if (!host) throw new Error('reCAPTCHA container missing.');
        webVerifierRef.current?.clear();
        webVerifierRef.current = new RecaptchaVerifier(auth, host, { size: 'invisible' });
        const vid = await startPhoneMfaEnrollment(auth, user, e164, webVerifierRef.current);
        setVerificationId(vid);
        setStep('code');
      } else {
        const modal = recaptchaRef?.current;
        if (!modal) {
          throw new Error('reCAPTCHA is not ready. Restart the app and try again.');
        }
        const vid = await startPhoneMfaEnrollment(
          auth,
          user,
          e164,
          modal as unknown as ApplicationVerifier
        );
        setVerificationId(vid);
        setStep('code');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send verification SMS.';
      Alert.alert('Verification failed', msg);
    } finally {
      setBusy(false);
    }
  }, [auth, user, phone, recaptchaRef, webHostReady]);

  const verifyAndEnroll = useCallback(async () => {
    if (!verificationId || !code.trim()) {
      Alert.alert('Code required', 'Enter the code from your SMS.');
      return;
    }
    setBusy(true);
    try {
      await completePhoneMfaEnrollment(user, verificationId, code.trim());
      onEnrolled();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid code or enrollment failed.';
      Alert.alert('Could not enable 2FA', msg);
    } finally {
      setBusy(false);
    }
  }, [verificationId, code, user, onEnrolled, onClose]);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.title}>Two-factor authentication</Text>
            <Text style={styles.sub}>
              {step === 'phone'
                ? 'Enter your phone number. We will send a code by SMS.'
                : 'Enter the verification code we sent.'}
            </Text>

            {step === 'phone' ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="+1 601-954-9253"
                  placeholderTextColor="#aaa"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  value={phone}
                  onChangeText={(t) => setPhone(formatUsMfaPhoneFromInput(t))}
                  editable={!busy}
                  maxLength={17}
                />
                <Pressable
                  style={[
                    styles.primaryBtn,
                    (busy || (Platform.OS === 'web' && !webHostReady)) && styles.btnDisabled,
                  ]}
                  onPress={() => void sendCode()}
                  disabled={busy || (Platform.OS === 'web' && !webHostReady)}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Send code</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  placeholderTextColor="#aaa"
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                  editable={!busy}
                />
                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  onPress={() => void verifyAndEnroll()}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Verify & enable</Text>
                  )}
                </Pressable>
                <Pressable style={styles.linkBtn} onPress={() => setStep('phone')} disabled={busy}>
                  <Text style={styles.linkTxt}>Change phone number</Text>
                </Pressable>
              </>
            )}

            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#F2F0EB',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a18',
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: '#888780',
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  primaryBtn: {
    backgroundColor: '#534AB7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  linkTxt: {
    color: '#534AB7',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelTxt: {
    color: '#888780',
    fontSize: 16,
    fontWeight: '600',
  },
});
