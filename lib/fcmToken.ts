import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getFirebaseApp } from './firebase';

function readEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

async function requestFcmTokenWeb(): Promise<string | null> {
  try {
    const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) return null;
    const app = getFirebaseApp();
    if (!app) return null;
    const vapidKey = readEnv('EXPO_PUBLIC_FIREBASE_VAPID_KEY');
    if (!vapidKey) return null;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey });
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Requests push notification permissions and returns the device push token.
 * Returns null if permissions are denied, unsupported, or if the call fails.
 *
 * - Web: Firebase `getToken(messaging, { vapidKey })` (set `EXPO_PUBLIC_FIREBASE_VAPID_KEY`).
 * - Android: FCM registration token via Expo Notifications.
 * - iOS: device push token via Expo Notifications (APNs format; use with backends that accept it).
 */
export async function requestFcmToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return requestFcmTokenWeb();
  }
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
 * Subscribes to device push token refresh events (native only).
 * Firebase Web Messaging v9+ does not expose onTokenRefresh; token is refreshed via
 * `requestFcmToken` on foreground / auth heartbeat.
 * Call the returned function to unsubscribe.
 */
export function addFcmTokenRefreshListener(callback: (token: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addPushTokenListener((token) => {
    if (typeof token.data === 'string') callback(token.data);
  });
  return () => sub.remove();
}
