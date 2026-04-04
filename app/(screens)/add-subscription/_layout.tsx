import { Stack } from 'expo-router';
import { AddSubscriptionPickMembersProvider } from './AddSubscriptionPickMembersContext';

export default function AddSubscriptionLayout() {
  return (
    <AddSubscriptionPickMembersProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="details" />
        <Stack.Screen name="members" />
        <Stack.Screen name="pick-members" />
        <Stack.Screen name="review" />
      </Stack>
    </AddSubscriptionPickMembersProvider>
  );
}
