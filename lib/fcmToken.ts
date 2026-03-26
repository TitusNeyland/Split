import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Requests push notification permissions and returns the device push token.
 * Returns null if permissions are denied, on web, or if the call fails.
 *
 * Token type by platform:
 *  - Android: FCM registration token
 *  - iOS: APNs device token
 */
export async function requestFcmToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === 'string' ? token.data : null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to device push token refresh events.
 * Call the returned function to unsubscribe.
 */
export function addFcmTokenRefreshListener(callback: (token: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addPushTokenListener((token) => {
    if (typeof token.data === 'string') callback(token.data);
  });
  return () => sub.remove();
}
