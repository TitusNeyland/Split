import { Stack } from 'expo-router';

export default function SubscriptionIdLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="edit-split" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
