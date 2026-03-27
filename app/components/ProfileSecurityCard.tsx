import React, { useCallback, useEffect, useMemo, useState } from 'react';
;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfilePurpleToggleVisual } from './ProfilePurpleToggleVisual';
import MfaPhoneEnrollmentModal from './MfaPhoneEnrollmentModal';
import { useSecurityPrefs } from '../contexts/SecurityPrefsContext';
import { getFirebaseAuth, getFirebaseWebOptions, isFirebaseConfigured } from '../../lib/firebase';
import {
  isPhoneMfaEnrolled,
  reauthenticateWithEmailPassword,
  unenrollPhoneMfa,
  userHasPasswordProvider,
} from '../../lib/auth/phoneMfa';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  lilac: '#EEEDFE',
  purpleIcon: '#534AB7',
};

type Props = {
  user: User | null;
};

export default function ProfileSecurityCard({ user }: Props) {
  const insets = useSafeAreaInsets();
  const { biometricLockEnabled, setBiometricLockEnabled } = useSecurityPrefs();
  const [bioHardware, setBioHardware] = useState(Platform.OS !== 'web');
  const [mfaOpen, setMfaOpen] = useState(false);
  const [disableMfaOpen, setDisableMfaOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(user);

  useEffect(() => {
    setAuthUser(user);
  }, [user]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setAuthUser(u));
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setBioHardware(false);
      return;
    }
    void (async () => {
      const h = await LocalAuthentication.hasHardwareAsync();
      setBioHardware(h);
    })();
  }, []);

  const mfaEnrolled = authUser ? isPhoneMfaEnrolled(authUser) : false;

  const canUseMfa = isFirebaseConfigured() && !!authUser;
  const firebaseOpts = getFirebaseWebOptions();
  const authInstance = getFirebaseAuth();

  const onBiometricToggle = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Biometric app lock is not available on web.');
      return;
    }
    if (!bioHardware) {
      Alert.alert(
        'Biometrics unavailable',
        'This device does not support Face ID or fingerprint.'
      );
      return;
    }
    const next = !biometricLockEnabled;
    if (!next) {
      Alert.alert(
        'Turn off biometric lock?',
        'Anyone with access to this unlocked device can open Split without Face ID, fingerprint, or passcode.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Turn off',
            style: 'destructive',
            onPress: () => void setBiometricLockEnabled(false),
          },
        ]
      );
      return;
    }
    const ok = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to enable app lock',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (ok.success) {
      await setBiometricLockEnabled(true);
    }
  }, [bioHardware, biometricLockEnabled, setBiometricLockEnabled]);

  const onMfaToggle = useCallback(() => {
    if (!canUseMfa || !authInstance || !authUser || !firebaseOpts) {
      Alert.alert(
        'Sign in required',
        'Sign in with Firebase to manage two-factor authentication.'
      );
      return;
    }
    if (mfaEnrolled) {
      if (!userHasPasswordProvider(authUser)) {
        Alert.alert(
          'Cannot turn off here',
          'This account did not sign in with email and password. Manage two-factor settings in Firebase or your identity provider.'
        );
        return;
      }
      if (!authUser.email) {
        Alert.alert('Email missing', 'Add an email address to your account before disabling 2FA.');
        return;
      }
      setPassword('');
      setDisableMfaOpen(true);
      return;
    }
    setMfaOpen(true);
  }, [canUseMfa, authInstance, authUser, firebaseOpts, mfaEnrolled]);

  const confirmDisableMfa = useCallback(async () => {
    if (!authUser?.email || !password.trim()) {
      Alert.alert('Password required', 'Enter your current password to disable two-factor authentication.');
      return;
    }
    setDisableBusy(true);
    try {
      await reauthenticateWithEmailPassword(authUser, authUser.email, password);
      await unenrollPhoneMfa(authUser);
      setDisableMfaOpen(false);
      setPassword('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not disable 2FA.';
      Alert.alert('Could not disable', msg);
    } finally {
      setDisableBusy(false);
    }
  }, [authUser, password]);

  const mfaSub = useMemo(() => {
    if (!canUseMfa) return 'Sign in to enable two-factor authentication';
    if (mfaEnrolled) return 'Enabled via SMS';
    return 'Extra login security';
  }, [canUseMfa, mfaEnrolled]);

  const bioSub = useMemo(() => {
    if (Platform.OS === 'web') return 'Available on iOS and Android';
    if (!bioHardware) return 'Biometrics not available on this device';
    return 'Unlock app securely';
  }, [bioHardware]);

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => void onBiometricToggle()}
        accessibilityRole="switch"
        accessibilityState={{
          checked: biometricLockEnabled,
          disabled: Platform.OS === 'web' || !bioHardware,
        }}
        accessibilityLabel="Face ID and biometric lock"
        accessibilityHint={bioSub}
      >
        <View style={[styles.iconBox, { backgroundColor: C.lilac, borderRadius: 10 }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={C.purpleIcon} />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Face ID / biometric</Text>
          <Text style={styles.sub}>{bioSub}</Text>
        </View>
        <ProfilePurpleToggleVisual
          value={Platform.OS === 'web' ? false : biometricLockEnabled}
        />
      </Pressable>

      <View style={styles.hairline} />
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={onMfaToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: mfaEnrolled, disabled: !canUseMfa }}
        accessibilityLabel="Two-factor authentication"
        accessibilityHint={mfaSub}
      >
        <View style={[styles.iconBox, { backgroundColor: C.lilac, borderRadius: 10 }]}>
          <Ionicons name="lock-closed-outline" size={18} color={C.purpleIcon} />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Two-factor authentication</Text>
          <Text style={styles.sub}>{mfaSub}</Text>
        </View>
        <ProfilePurpleToggleVisual value={mfaEnrolled} />
      </Pressable>

      {canUseMfa && authInstance && authUser && firebaseOpts ? (
        <MfaPhoneEnrollmentModal
          visible={mfaOpen}
          auth={authInstance}
          user={authUser}
          firebaseConfig={firebaseOpts}
          onClose={() => setMfaOpen(false)}
          onEnrolled={() => setMfaOpen(false)}
        />
      ) : null}

      <Modal
        visible={disableMfaOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !disableBusy && setDisableMfaOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.mfaOverlay}
        >
          <Pressable style={styles.mfaBackdrop} onPress={() => !disableBusy && setDisableMfaOpen(false)} />
          <View style={[styles.mfaSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.mfaTitle}>Disable two-factor authentication</Text>
            <Text style={styles.mfaSub}>Enter your current password to confirm.</Text>
            <TextInput
              style={styles.mfaInput}
              placeholder="Password"
              placeholderTextColor="#aaa"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!disableBusy}
              autoCapitalize="none"
            />
            <Pressable
              style={[styles.mfaPrimary, disableBusy && { opacity: 0.7 }]}
              onPress={() => void confirmDisableMfa()}
              disabled={disableBusy}
            >
              {disableBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.mfaPrimaryTxt}>Turn off 2FA</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.mfaCancel}
              onPress={() => !disableBusy && setDisableMfaOpen(false)}
              disabled={disableBusy}
            >
              <Text style={styles.mfaCancelTxt}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowPressed: {
    opacity: 0.88,
  },
  iconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  sub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  mfaOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
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
    color: C.text,
    marginBottom: 8,
  },
  mfaSub: {
    fontSize: 14,
    color: C.muted,
    marginBottom: 14,
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
  mfaCancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  mfaCancelTxt: {
    color: C.muted,
    fontSize: 16,
    fontWeight: '600',
  },
});
