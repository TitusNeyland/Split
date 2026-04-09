import React, { useCallback, useState } from 'react';
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
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import Svg, { Circle, Path } from 'react-native-svg';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';

const C = {
  bg: '#F2F0EB',
  card: '#fff',
  text: '#1a1a18',
  muted: '#72727F',
  purple: '#534AE7',
  inputBg: '#fff',
  border: 'rgba(0,0,0,0.08)',
  green: '#1D9E75',
  error: '#E24B4A',
};

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
      <Path d="M1 1l22 22" stroke="#888780" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ChangeEmailScreen() {
  const insets = useSafeAreaInsets();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const canSubmit = emailValid && password.length > 0 && !sending;

  const onSend = useCallback(async () => {
    if (!canSubmit) return;
    if (!isFirebaseConfigured()) {
      Alert.alert('Not configured', 'Firebase keys are missing.');
      return;
    }
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user || !user.email) {
      Alert.alert('Not signed in', 'Please sign in to change your email.');
      return;
    }

    setSending(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, newEmail.trim());
      setSent(true);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        Alert.alert('Incorrect password', 'The password you entered is wrong. Try again.');
      } else if (err.code === 'auth/email-already-in-use') {
        Alert.alert('Email in use', 'That email is already linked to another account.');
      } else if (err.code === 'auth/invalid-email') {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
      } else if (err.code === 'auth/network-request-failed') {
        Alert.alert('No connection', 'Check your internet connection and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        Alert.alert('Too many attempts', 'Please wait a moment and try again.');
      } else {
        Alert.alert('Could not send verification', 'Something went wrong. Please try again.');
      }
    } finally {
      setSending(false);
    }
  }, [canSubmit, newEmail, password]);

  if (sent) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={C.purple} />
          </Pressable>
          <Text style={styles.title}>Change email</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.confirmedWrap}>
          <View style={styles.confirmedIcon}>
            <Ionicons name="mail" size={32} color={C.green} />
          </View>
          <Text style={styles.confirmedTitle}>Check your new inbox</Text>
          <Text style={styles.confirmedBody}>
            We sent a verification link to{' '}
            <Text style={styles.confirmedEmail}>{newEmail.trim()}</Text>.
            {'\n\n'}Verify the address to complete the change. Your email won't update until you click the link.
          </Text>
          <Pressable
            style={styles.doneBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.doneBtnTxt}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
        <Text style={styles.title}>Change email</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sub}>
          Enter your new email address and current password. We'll send a verification link to the new address.
        </Text>

        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>New email</Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="name@example.com"
              placeholderTextColor="#B0B0BB"
              style={styles.fieldInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              editable={!sending}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.pwWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Current password"
                placeholderTextColor="#B0B0BB"
                style={[styles.fieldInput, styles.pwInput]}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                editable={!sending}
              />
              <Pressable
                style={styles.eyeHit}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
              >
                <EyeIcon visible={showPassword} />
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={onSend}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Send verification"
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnTxt}>Send verification</Text>
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
  center: {
    flex: 1,
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
  sub: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
    marginBottom: 20,
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
    width: 88,
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
  // confirmed state
  confirmedWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  confirmedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E1F5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  confirmedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmedBody: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  confirmedEmail: {
    color: C.text,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  doneBtnTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
