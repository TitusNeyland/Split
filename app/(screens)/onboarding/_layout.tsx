import React from 'react';
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goals" />
      <Stack.Screen name="name" />
      <Stack.Screen name="photo" />
      <Stack.Screen name="email" />
      <Stack.Screen name="password" />
      <Stack.Screen name="notifications" options={{ gestureEnabled: false }} />
      <Stack.Screen name="payment" options={{ gestureEnabled: false }} />
      <Stack.Screen name="find-us" options={{ gestureEnabled: false }} />
      <Stack.Screen name="complete" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
