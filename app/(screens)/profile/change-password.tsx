import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';

const C = {
  bg: '#F2F0EB',
  card: '#fff',
  text: '#1a1a18',
  muted: '#72727F',
  purple: '#534AE7',
  border: 'rgba(0,0,0,0.08)',
  green: '#1D9E75',
  error: '#E24B4A',
  checkBorder: '#D3D1C7',
};

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#888780" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={12} cy={12} r={3} stroke="#888780" strokeWidth={1.5} />
      </Svg>
    );
  }
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
        stroke="#888780" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M1 1l22 22" stroke="#888780" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckRow({ label, met }: { label: string; met: boolean }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkCircle, met && styles.checkCircleMet]}>
        {met ? (
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Polyline points="20 6 9 17 4 12" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <Text style={[styles.checkLabel, met && styles.checkLabelMet]}>{label}</Text>
    </View>
  );
}

function MismatchRow({ match, showMismatch }: { match: boolean; showMismatch: boolean }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkCircle, match && styles.checkCircleMet, showMismatch && styles.checkCircleErr]}>
        {match ? (
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Polyline points="20 6 9 17 4 12" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : showMismatch ? (
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <Text style={[styles.checkLabel, match && styles.checkLabelMet, showMismatch && styles.checkLabelErr]}>
        Passwords match
      </Text>
    </View>
  );
}

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasLen = newPw.length >= 8;
  const hasLower = /[a-z]/.test(newPw);
  const hasUpper = /[A-Z]/.test(newPw);
  const hasNum = /\d/.test(newPw);
  const pwsMatch = newPw.length > 0 && confirmPw === newPw;
  const showMismatch = confirmPw.length > 0 && !pwsMatch;

  const allValid = useMemo(
    () => currentPw.length > 0 && hasLen && hasLower && hasUpper && hasNum && pwsMatch,
    [currentPw, hasLen, hasLower, hasUpper, hasNum, pwsMatch]
  );

  const onUpdate = useCallback(async () => {
    if (!allValid || saving) return;
    if (!isFirebaseConfigured()) {
      Alert.alert('Not configured', 'Firebase keys are missing.');
      return;
    }
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user || !user.email) {
      Alert.alert('Not signed in', 'Please sign in to change your password.');
      return;
    }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      Alert.alert('Password updated', 'Your password has been changed successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        Alert.alert('Incorrect password', 'The current password you entered is wrong.');
      } else if (err.code === 'auth/weak-password') {
        Alert.alert('Weak password', 'Choose a stronger password.');
      } else if (err.code === 'auth/network-request-failed') {
        Alert.alert('No connection', 'Check your internet connection and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        Alert.alert('Too many attempts', 'Please wait a moment and try again.');
      } else {
        Alert.alert('Could not update password', 'Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [allValid, saving, currentPw, newPw]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={C.purple} />
        </Pressable>
        <Text style={styles.title}>Change password</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Current</Text>
            <View style={styles.pwWrap}>
              <TextInput
                value={currentPw}
                onChangeText={setCurrentPw}
                placeholder="Current password"
                placeholderTextColor="#B0B0BB"
                style={[styles.fieldInput, styles.pwInput]}
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                editable={!saving}
              />
              <Pressable style={styles.eyeHit} onPress={() => setShowCurrent((v) => !v)} hitSlop={8}>
                <EyeIcon visible={showCurrent} />
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>New</Text>
            <View style={styles.pwWrap}>
              <TextInput
                value={newPw}
                onChangeText={setNewPw}
                placeholder="New password"
                placeholderTextColor="#B0B0BB"
                style={[styles.fieldInput, styles.pwInput]}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!saving}
              />
              <Pressable style={styles.eyeHit} onPress={() => setShowNew((v) => !v)} hitSlop={8}>
                <EyeIcon visible={showNew} />
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Confirm</Text>
            <View style={styles.pwWrap}>
              <TextInput
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Confirm new password"
                placeholderTextColor="#B0B0BB"
                style={[styles.fieldInput, styles.pwInput]}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!saving}
              />
              <Pressable style={styles.eyeHit} onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                <EyeIcon visible={showConfirm} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.checklist}>
          <CheckRow label="At least 8 characters" met={hasLen} />
          <CheckRow label="1 lowercase letter" met={hasLower} />
          <CheckRow label="1 uppercase letter" met={hasUpper} />
          <CheckRow label="1 number" met={hasNum} />
          <MismatchRow match={pwsMatch} showMismatch={showMismatch} />
        </View>

        <Pressable
          style={[styles.submitBtn, (!allValid || saving) && styles.submitBtnDisabled]}
          onPress={onUpdate}
          disabled={!allValid || saving}
          accessibilityRole="button"
          accessibilityLabel="Update password"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnTxt}>Update password</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldLabel: {
    width: 72,
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    flexShrink: 0,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    textAlign: 'right',
  },
  pwWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pwInput: {
    flex: 1,
    paddingRight: 32,
  },
  eyeHit: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklist: {
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 4,
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
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleMet: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  checkCircleErr: {
    backgroundColor: C.error,
    borderColor: C.error,
  },
  checkLabel: {
    fontSize: 13,
    color: C.text,
  },
  checkLabelMet: {
    color: C.green,
  },
  checkLabelErr: {
    color: C.error,
  },
  submitBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
