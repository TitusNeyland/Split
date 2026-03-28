import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import { getOrCreateDeviceSessionId } from '../../../lib/auth/deviceSessionIdentity';
import { getDeviceDisplayName, getDeviceTypeCategory } from '../../../lib/auth/deviceSessionMetadata';
import { upsertCurrentAuthSession } from '../../../lib/auth/authSessionsFirestore';
import { ensurePhoneHashOnUserDoc } from '../../../lib/friends/phoneHashUserDoc';
import { addFcmTokenRefreshListener, requestFcmToken } from '../../../lib/fcmToken';

/**
 * Writes `users/{uid}/sessions/{deviceSessionId}` on sign-in and when the app becomes active,
 * including `fcmToken` when push permission is granted (native + web with VAPID).
 */
async function heartbeat(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return;
  try {
    const sessionId = await getOrCreateDeviceSessionId();
    const token = await requestFcmToken();
    await upsertCurrentAuthSession(u.uid, sessionId, {
      deviceName: getDeviceDisplayName(),
      deviceType: getDeviceTypeCategory(),
      ...(token ? { fcmToken: token } : {}),
    });
    await ensurePhoneHashOnUserDoc();
  } catch {
    /* ignore heartbeat errors */
  }
}

async function writeSessionFcmToken(token: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return;
  try {
    const sessionId = await getOrCreateDeviceSessionId();
    await upsertCurrentAuthSession(u.uid, sessionId, {
      deviceName: getDeviceDisplayName(),
      deviceType: getDeviceTypeCategory(),
      fcmToken: token,
    });
  } catch {
    /* ignore */
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

    const unsubTokenRefresh = addFcmTokenRefreshListener((token) => {
      void writeSessionFcmToken(token);
    });

    void heartbeat();

    return () => {
      unsubAuth();
      sub.remove();
      unsubTokenRefresh();
    };
  }, []);

  return null;
}
