import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, reload, sendEmailVerification } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { ProfilePurpleToggleVisual } from './ProfilePurpleToggleVisual';
import MfaPhoneEnrollmentModal from '../auth/MfaPhoneEnrollmentModal';
import DisableMfaModal from '../auth/DisableMfaModal';
import { useSecurityPrefs } from '../../contexts/SecurityPrefsContext';
import { getFirebaseAuth, getFirebaseWebOptions, isFirebaseConfigured } from '../../lib/firebase';
import { isPhoneMfaEnrolled, userHasPasswordProvider } from '../../lib/auth/phoneMfa';

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
  const { biometricLockEnabled, setBiometricLockEnabled } = useSecurityPrefs();
  const [bioHardware, setBioHardware] = useState(Platform.OS !== 'web');
  const [mfaOpen, setMfaOpen] = useState(false);
  const [disableMfaOpen, setDisableMfaOpen] = useState(false);
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

  const sendVerificationEmailForMfa = useCallback(async () => {
    if (!authUser?.email) return;
    try {
      await sendEmailVerification(authUser);
      Alert.alert(
        'Check your email',
        "Open the verification link, then tap I've verified on the next screen or try enabling 2FA again."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send verification email.';
      Alert.alert('Could not send email', msg);
    }
  }, [authUser]);

  const refreshAuthUserAfterVerify = useCallback(async () => {
    if (!authInstance?.currentUser) return;
    try {
      await reload(authInstance.currentUser);
      setAuthUser(authInstance.currentUser);
      if (authInstance.currentUser.emailVerified) {
        Alert.alert('Email verified', 'You can enable two-factor authentication now.');
      } else {
        Alert.alert('Not verified yet', 'Open the link in your email, then try again.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not refresh your account.';
      Alert.alert('Refresh failed', msg);
    }
  }, [authInstance]);

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
      setDisableMfaOpen(true);
      return;
    }
    if (!authUser.email) {
      Alert.alert('Email required', 'Add an email to your account before enabling two-factor authentication.');
      return;
    }
    if (!authUser.emailVerified) {
      Alert.alert(
        'Verify your email first',
        'Firebase requires a verified email before SMS two-factor can be enabled.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send verification email', onPress: () => void sendVerificationEmailForMfa() },
          { text: "I've verified", onPress: () => void refreshAuthUserAfterVerify() },
        ]
      );
      return;
    }
    setMfaOpen(true);
  }, [
    canUseMfa,
    authInstance,
    authUser,
    firebaseOpts,
    mfaEnrolled,
    sendVerificationEmailForMfa,
    refreshAuthUserAfterVerify,
  ]);

  const mfaSub = useMemo(() => {
    if (!canUseMfa) return 'Sign in to enable two-factor authentication';
    if (mfaEnrolled) return 'Enabled via SMS';
    if (authUser?.email && !authUser.emailVerified) return 'Verify your email to enable';
    return 'Extra login security';
  }, [canUseMfa, mfaEnrolled, authUser?.email, authUser?.emailVerified]);

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

      {canUseMfa && authInstance && authUser && firebaseOpts ? (
        <DisableMfaModal
          visible={disableMfaOpen}
          auth={authInstance}
          user={authUser}
          firebaseConfig={firebaseOpts}
          onClose={() => setDisableMfaOpen(false)}
          onDisabled={() => setDisableMfaOpen(false)}
        />
      ) : null}
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
});
