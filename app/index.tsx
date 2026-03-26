import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { getOnboardingCompleteFromStorage } from '../lib/onboardingStorage';

/**
 * Entry: signed-in users → tabs; guests with completed onboarding → sign-in; else → onboarding.
 */
export default function IndexRoute() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubAuth: (() => void) | null = null;

    void (async () => {
      const onboardingDone = await getOnboardingCompleteFromStorage();
      if (cancelled) return;

      if (!isFirebaseConfigured()) {
        setHref(onboardingDone ? '/sign-in' : '/onboarding');
        return;
      }

      const auth = getFirebaseAuth();
      if (!auth) {
        setHref(onboardingDone ? '/sign-in' : '/onboarding');
        return;
      }

      unsubAuth = onAuthStateChanged(auth, (user) => {
        if (cancelled) return;
        if (user) {
          setHref('/(tabs)');
          return;
        }
        setHref(onboardingDone ? '/sign-in' : '/onboarding');
      });
    })();

    return () => {
      cancelled = true;
      unsubAuth?.();
    };
  }, []);

  if (!href) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    );
  }

  return <Redirect href={href} />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
