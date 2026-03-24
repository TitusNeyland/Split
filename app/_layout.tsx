import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import SplashScreen from './components/SplashScreen';
import AuthSessionSync from './components/AuthSessionSync';
import InviteDeepLinkBootstrap from './components/InviteDeepLinkBootstrap';
import PendingInviteAfterAuth from './components/PendingInviteAfterAuth';
import BiometricAppLock from './components/BiometricAppLock';
import { SecurityPrefsProvider } from './contexts/SecurityPrefsContext';
import { FirebaseRecaptchaProvider } from './contexts/FirebaseRecaptchaContext';
import { LocalProfileAvatarProvider } from './contexts/LocalProfileAvatarContext';
import { getFirebaseWebOptions, isFirebaseConfigured } from '../lib/firebase';
import { ENABLE_PROFILE_SECURITY } from '../constants/features';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';

export default function RootLayout() {
  const recaptchaRef = useRef<React.ElementRef<typeof FirebaseRecaptchaVerifierModal>>(null);
  const [showSplash, setShowSplash] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const firebaseOpts = ENABLE_PROFILE_SECURITY ? getFirebaseWebOptions() : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, [opacity]);

  const stackAndSplash = (
    <GestureHandlerRootView style={styles.root}>
      {/* LOCAL_PROFILE_AVATAR_OFFLINE — remove LocalProfileAvatarProvider when Firebase-only avatars (see lib/localProfileAvatarStorage.ts). */}
      <LocalProfileAvatarProvider>
      <View style={styles.root}>
        <AuthSessionSync />
        <InviteDeepLinkBootstrap />
        <PendingInviteAfterAuth />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="(tabs)"
            options={{
              title: 'Split',
            }}
          />
          <Stack.Screen
            name="receipt/[id]"
            options={{
              headerShown: true,
              headerTitle: 'Receipt',
              headerTintColor: '#534AB7',
              headerStyle: { backgroundColor: '#F2F0EB' },
              headerShadowVisible: false,
              headerBackTitle: 'Activity',
              headerBackTitleStyle: { fontSize: 17 },
            }}
          />
          <Stack.Screen name="receipt-assign" options={{ headerShown: false }} />
          <Stack.Screen
            name="split-created"
            options={{
              headerShown: false,
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="subscription/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="invite-share"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              headerShown: false,
            }}
          />
          <Stack.Screen name="invite/[inviteId]" options={{ headerShown: false }} />
          <Stack.Screen name="friends" options={{ headerShown: false }} />
          <Stack.Screen name="friends-contacts" options={{ headerShown: false }} />
        </Stack>
        {showSplash && (
          <Animated.View style={[styles.splashOverlay, { opacity }]}>
            <SplashScreen />
          </Animated.View>
        )}
      </View>
      </LocalProfileAvatarProvider>
    </GestureHandlerRootView>
  );

  const withSecurity = ENABLE_PROFILE_SECURITY ? (
    <SecurityPrefsProvider>
      {isFirebaseConfigured() && firebaseOpts && Platform.OS !== 'web' ? (
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaRef}
          firebaseConfig={firebaseOpts}
          attemptInvisibleVerification
          title="Verify phone"
        />
      ) : null}
      <FirebaseRecaptchaProvider verifierRef={recaptchaRef}>
        <BiometricAppLock>{stackAndSplash}</BiometricAppLock>
      </FirebaseRecaptchaProvider>
    </SecurityPrefsProvider>
  ) : (
    stackAndSplash
  );

  if (stripePublishableKey) {
    return (
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.split"
        urlScheme="split"
      >
        {withSecurity}
      </StripeProvider>
    );
  }

  return withSecurity;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});


