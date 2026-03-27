import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import { getPendingInviteId, setPendingInviteId } from '../../../lib/friends/pendingInviteStorage';

/**
 * After sign-up / sign-in, if an invite id was stored (link opened while logged out), open the accept screen.
 */
export default function PendingInviteAfterAuth() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        handledRef.current = false;
        return;
      }
      if (handledRef.current) return;
      const pending = await getPendingInviteId();
      if (!pending) return;
      handledRef.current = true;
      await setPendingInviteId(null);
      router.replace(`/invite/${pending}`);
    });

    return () => {
      unsub();
    };
  }, [router]);

  return null;
}
