import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { getOrCreateDeviceSessionId } from '../../lib/auth/deviceSessionIdentity';
import { getDeviceDisplayName, getDeviceTypeCategory } from '../../lib/auth/deviceSessionMetadata';
import { upsertCurrentAuthSession } from '../../lib/auth/authSessionsFirestore';
import { ensurePhoneHashOnUserDoc } from '../../lib/friends/phoneHashUserDoc';

async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    console.log('[PushToken] permission status:', status);
    if (status !== 'granted') {
      console.log('[PushToken] permission not granted, skipping token fetch');
      return null;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    console.log('[PushToken] fetching token with projectId:', projectId);
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[PushToken] got token:', token.data);
    return token.data;
  } catch (e) {
    console.log('[PushToken] error fetching token:', e);
    return null;
  }
}

/**
 * Writes `users/{uid}/sessions/{deviceSessionId}` on sign-in and when the app becomes active.
 */
async function heartbeat(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return;
  try {
    const [sessionId, fcmToken] = await Promise.all([
      getOrCreateDeviceSessionId(),
      getExpoPushToken(),
    ]);
    console.log('[Heartbeat] sessionId:', sessionId, '| fcmToken:', fcmToken ?? '(null — not writing to Firestore)');
    await upsertCurrentAuthSession(u.uid, sessionId, {
      deviceName: getDeviceDisplayName(),
      deviceType: getDeviceTypeCategory(),
      ...(fcmToken ? { fcmToken } : {}),
    });
    await ensurePhoneHashOnUserDoc();
  } catch (e) {
    console.log('[Heartbeat] error:', e);
  }
}

export default function AuthSessionSync() {
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    const unsubAuth = onAuthStateChanged(auth, () => {
      void heartbeat();
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void heartbeat();
    });

    void heartbeat();

    return () => {
      unsubAuth();
      sub.remove();
    };
  }, []);

  return null;
}
