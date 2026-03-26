import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';
import { getOrCreateDeviceSessionId } from './deviceSessionIdentity';
import { getDeviceDisplayName, getDeviceTypeCategory } from './deviceSessionMetadata';
import { upsertCurrentAuthSession } from './authSessionsFirestore';

/**
 * Clears the FCM token from the current session doc then calls Firebase signOut.
 * Token must be cleared while the user is still authenticated so Firestore
 * security rules allow the write. Proceeds with sign-out even if clearing fails.
 */
export async function signOutAndClearSession(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  const user = auth.currentUser;
  if (user) {
    try {
      const sessionId = await getOrCreateDeviceSessionId();
      await upsertCurrentAuthSession(user.uid, sessionId, {
        deviceName: getDeviceDisplayName(),
        deviceType: getDeviceTypeCategory(),
        fcmToken: null,
      });
    } catch {
      /* best-effort; proceed with sign-out regardless */
    }
  }
  await signOut(auth);
}
