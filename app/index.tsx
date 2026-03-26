import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import {
  getOnboardingCompleteFromStorage,
  hasOnboardingEmailSaved,
  hasOnboardingNameSaved,
  hasOnboardingNotificationsStepDone,
  hasOnboardingPaymentStepDone,
  hasOnboardingPasswordSaved,
} from '../lib/onboardingStorage';
import { hasLocalOnboardingGoalsDraft } from '../lib/onboardingGoals';

/**
 * Entry: completed onboarding → tabs (or sign-in if guest); anonymous mid-flow → resume password / email / name;
 * otherwise onboarding welcome or sign-in.
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

      unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;
        if (user) {
          if (onboardingDone) {
            setHref('/(tabs)');
            return;
          }
          if (!user.isAnonymous) {
            if (await hasOnboardingPaymentStepDone()) {
              setHref('/onboarding/find-us');
              return;
            }
            if (await hasOnboardingNotificationsStepDone()) {
              setHref('/onboarding/payment');
              return;
            }
            if (await hasOnboardingPasswordSaved()) {
              setHref('/onboarding/notifications');
              return;
            }
            if (await hasOnboardingEmailSaved()) {
              setHref('/onboarding/password');
              return;
            }
            setHref('/(tabs)');
            return;
          }
          if (user.isAnonymous) {
            if (await hasOnboardingEmailSaved()) {
              setHref('/onboarding/password');
              return;
            }
            if (await hasOnboardingNameSaved()) {
              setHref('/onboarding/email');
              return;
            }
            if (await hasLocalOnboardingGoalsDraft()) {
              setHref('/onboarding/name');
              return;
            }
          }
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
