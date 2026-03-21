import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Stack } from 'expo-router';
import SplashScreen from './components/SplashScreen';

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

  return (
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
      </Stack>
      {showSplash && (
        <Animated.View style={[styles.splashOverlay, { opacity }]}>
          <SplashScreen />
        </Animated.View>
      )}
    </View>
  );
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


