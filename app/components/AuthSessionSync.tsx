import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { getOrCreateDeviceSessionId } from '../../lib/deviceSessionIdentity';
import { getDeviceDisplayName, getDeviceTypeCategory } from '../../lib/deviceSessionMetadata';
import { upsertCurrentAuthSession } from '../../lib/authSessionsFirestore';
import { requestFcmToken, addFcmTokenRefreshListener } from '../../lib/fcmToken';

async function heartbeat(fcmToken: string | null): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return;
  try {
    const sessionId = await getOrCreateDeviceSessionId();
    await upsertCurrentAuthSession(u.uid, sessionId, {
      deviceName: getDeviceDisplayName(),
      deviceType: getDeviceTypeCategory(),
      fcmToken,
    });
  } catch {
    /* ignore heartbeat errors */
  }
}

export default function AuthSessionSync() {
  const fcmTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    // Fetch the device push token once; subsequent refreshes handled below.
    void requestFcmToken().then((token) => {
      fcmTokenRef.current = token;
      void heartbeat(token);
    });

    // Keep the stored token up to date if the OS rotates it.
    const unsubTokenRefresh = addFcmTokenRefreshListener((newToken) => {
      fcmTokenRef.current = newToken;
      void heartbeat(newToken);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) void heartbeat(fcmTokenRef.current);
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void heartbeat(fcmTokenRef.current);
    });

    void heartbeat(fcmTokenRef.current);

    return () => {
      unsubAuth();
      unsubTokenRefresh();
      sub.remove();
    };
  }, []);

  return null;
}
