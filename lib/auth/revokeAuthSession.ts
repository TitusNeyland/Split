import { revokeSessionViaApi } from './sessionRevokeApi';
import { deleteAuthSessionDoc } from './authSessionsFirestore';

/**
 * Revoke another device: prefer API (FCM + Firestore via Admin). Falls back to client deleteDoc
 * if the API is unreachable (requires Firestore rules to allow the signed-in user to delete).
 */
export async function revokeOtherAuthSession(
  uid: string,
  sessionId: string,
  idToken: string | null
): Promise<void> {
  if (idToken) {
    const ok = await revokeSessionViaApi(idToken, sessionId);
    if (ok) return;
  }
  await deleteAuthSessionDoc(uid, sessionId);
}
