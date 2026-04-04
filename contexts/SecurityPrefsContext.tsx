import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_KEY = 'split_biometric_lock_enabled';

type SecurityPrefsContextValue = {
  biometricLockEnabled: boolean;
  setBiometricLockEnabled: (next: boolean) => Promise<void>;
  biometricPrefsLoaded: boolean;
};

const SecurityPrefsContext = createContext<SecurityPrefsContextValue | null>(null);

export function SecurityPrefsProvider({ children }: { children: React.ReactNode }) {
  const [biometricLockEnabled, setBiometricLockEnabledState] = useState(true);
  const [biometricPrefsLoaded, setBiometricPrefsLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(BIOMETRIC_KEY);
        if (!alive) return;
        if (v === null) setBiometricLockEnabledState(true);
        else setBiometricLockEnabledState(v === 'true');
      } catch {
        if (alive) setBiometricLockEnabledState(true);
      } finally {
        if (alive) setBiometricPrefsLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setBiometricLockEnabled = useCallback(async (next: boolean) => {
    setBiometricLockEnabledState(next);
    try {
      await SecureStore.setItemAsync(BIOMETRIC_KEY, next ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      biometricLockEnabled,
      setBiometricLockEnabled,
      biometricPrefsLoaded,
    }),
    [biometricLockEnabled, setBiometricLockEnabled, biometricPrefsLoaded]
  );

  return (
    <SecurityPrefsContext.Provider value={value}>{children}</SecurityPrefsContext.Provider>
  );
}

export function useSecurityPrefs(): SecurityPrefsContextValue {
  const ctx = useContext(SecurityPrefsContext);
  if (!ctx) {
    throw new Error('useSecurityPrefs must be used within SecurityPrefsProvider');
  }
  return ctx;
}
