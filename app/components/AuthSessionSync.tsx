import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { getOrCreateDeviceSessionId } from '../../lib/auth/deviceSessionIdentity';
import { getDeviceDisplayName, getDeviceTypeCategory } from '../../lib/auth/deviceSessionMetadata';
import { upsertCurrentAuthSession } from '../../lib/auth/authSessionsFirestore';

/**
 * Writes `users/{uid}/sessions/{deviceSessionId}` on sign-in and when the app becomes active.
 * Set `fcmToken` when you wire push so revoke can signal remote sign-out.
 */
async function heartbeat(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return;
  try {
    const sessionId = await getOrCreateDeviceSessionId();
    await upsertCurrentAuthSession(u.uid, sessionId, {
      deviceName: getDeviceDisplayName(),
      deviceType: getDeviceTypeCategory(),
      fcmToken: null,
    });
  } catch {
    /* ignore heartbeat errors */
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
