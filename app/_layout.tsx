import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import SplashScreen from './components/SplashScreen';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

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

  const tree = (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.root}>
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
        </Stack>
        {showSplash && (
          <Animated.View style={[styles.splashOverlay, { opacity }]}>
            <SplashScreen />
          </Animated.View>
        )}
      </View>
    </GestureHandlerRootView>
  );

  if (stripePublishableKey) {
    return (
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.split"
        urlScheme="split"
      >
        {tree}
      </StripeProvider>
    );
  }

  return tree;
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


