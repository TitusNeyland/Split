import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  AppState,
  type AppStateStatus,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSecurityPrefs } from '../contexts/SecurityPrefsContext';

const BACKGROUND_LOCK_MS = 5 * 60 * 1000;

type Gate = 'loading' | 'app' | 'lock' | 'enroll';

export default function BiometricAppLock({ children }: { children: React.ReactNode }) {
  const { biometricLockEnabled, biometricPrefsLoaded, setBiometricLockEnabled } = useSecurityPrefs();
  const [gate, setGate] = useState<Gate>(Platform.OS === 'web' ? 'app' : 'loading');
  const gateRef = useRef<Gate>(gate);
  gateRef.current = gate;
  const lastBgAt = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Split',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use passcode',
    });
    return r.success === true;
  }, []);

  const evaluateGate = useCallback(async () => {
    if (Platform.OS === 'web' || !biometricLockEnabled) {
      setGate('app');
      return;
    }
    const has = await LocalAuthentication.hasHardwareAsync();
    if (!has) {
      setGate('app');
      return;
    }
    const enr = await LocalAuthentication.isEnrolledAsync();
    if (!enr) {
      setGate('enroll');
      return;
    }
    const ok = await authenticate();
    setGate(ok ? 'app' : 'lock');
  }, [biometricLockEnabled, authenticate]);

  useEffect(() => {
    if (!biometricPrefsLoaded || Platform.OS === 'web') {
      if (Platform.OS === 'web') setGate('app');
      return;
    }
    if (!biometricLockEnabled) {
      setGate('app');
      return;
    }
    setGate('loading');
    void evaluateGate();
  }, [biometricPrefsLoaded, biometricLockEnabled, evaluateGate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/active|foreground/) && next.match(/inactive|background/)) {
        lastBgAt.current = Date.now();
      }
      if (
        next === 'active' &&
        biometricLockEnabled &&
        Platform.OS !== 'web' &&
        gateRef.current === 'app'
      ) {
        const t = lastBgAt.current;
        if (t != null && Date.now() - t >= BACKGROUND_LOCK_MS) {
          void (async () => {
            const has = await LocalAuthentication.hasHardwareAsync();
            const enr = await LocalAuthentication.isEnrolledAsync();
            if (has && enr) {
              const ok = await authenticate();
              setGate(ok ? 'app' : 'lock');
            }
          })();
        }
      }
    });
    return () => sub.remove();
  }, [authenticate, biometricLockEnabled]);

  if (!biometricPrefsLoaded && Platform.OS !== 'web') {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    );
  }

  if (gate === 'loading' && biometricLockEnabled && Platform.OS !== 'web') {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    );
  }

  if (gate === 'enroll') {
    return (
      <View style={styles.blockerRoot}>
        <LinearGradient
          colors={['#6B3FA0', '#4A1570', '#2D0D45']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.blockerGrad}
        >
          <Ionicons name="finger-print-outline" size={48} color="rgba(255,255,255,0.9)" />
          <Text style={styles.blockerTitle}>Set up Face ID or fingerprint</Text>
          <Text style={styles.blockerSub}>
            App lock is on, but this device has no biometrics enrolled. Add one in Settings, or turn
            off app lock from your profile.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.blockerBtn, pressed && styles.blockerBtnPressed]}
            onPress={() => void Linking.openSettings()}
          >
            <Text style={styles.blockerBtnTxt}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.blockerBtnOutline, pressed && { opacity: 0.85 }]}
            onPress={() => void setBiometricLockEnabled(false)}
          >
            <Text style={styles.blockerBtnOutlineTxt}>Turn off app lock</Text>
          </Pressable>
        </LinearGradient>
      </View>
    );
  }

  if (gate === 'lock') {
    return (
      <View style={styles.blockerRoot}>
        <LinearGradient
          colors={['#6B3FA0', '#4A1570', '#2D0D45']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.blockerGrad}
        >
          <Ionicons name="lock-closed-outline" size={48} color="rgba(255,255,255,0.9)" />
          <Text style={styles.blockerTitle}>Split is locked</Text>
          <Text style={styles.blockerSub}>
            Use Face ID, fingerprint, or your device passcode to continue.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.blockerBtn, pressed && styles.blockerBtnPressed]}
            onPress={() =>
              void (async () => {
                const ok = await authenticate();
                setGate(ok ? 'app' : 'lock');
              })()
            }
          >
            <Text style={styles.blockerBtnTxt}>Unlock</Text>
          </Pressable>
        </LinearGradient>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F0EB',
  },
  blockerRoot: {
    flex: 1,
  },
  blockerGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  blockerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  blockerSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  blockerBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    marginTop: 8,
  },
  blockerBtnPressed: {
    opacity: 0.88,
  },
  blockerBtnTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  blockerBtnOutline: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  blockerBtnOutlineTxt: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
  },
});
