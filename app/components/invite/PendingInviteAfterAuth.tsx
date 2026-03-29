import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import {
  acceptPendingInvite,
  fetchInviteById,
  fetchUserProfileForInvite,
} from '../../../lib/friends/friendSystemFirestore';
import { inviteIsExpired } from '../../../lib/friends/inviteHelpers';
import { getPendingInviteId, setPendingInviteId } from '../../../lib/friends/pendingInviteStorage';
import { replaceWithSplitJoinedCelebration } from '../../../lib/navigation/splitJoinedCelebration';

/**
 * After sign-up / sign-in, if an invite id was stored (link opened in browser or before auth),
 * accept it and create the friendship (Cloud Function), then show a welcome message.
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

      try {
        const invite = await fetchInviteById(pending);
        if (!invite || invite.status !== 'pending' || inviteIsExpired(invite)) {
          await setPendingInviteId(null);
          return;
        }
        if (invite.createdBy === user.uid) {
          await setPendingInviteId(null);
          return;
        }

        handledRef.current = true;

        await acceptPendingInvite(pending, user.uid);
        await setPendingInviteId(null);

        if (invite.splitId) {
          const ok = await replaceWithSplitJoinedCelebration(router, invite.splitId, user.uid);
          if (!ok) {
            router.replace({
              pathname: '/subscription/[id]',
              params: { id: invite.splitId },
            });
          }
          return;
        }

        const sender = await fetchUserProfileForInvite(invite.createdBy);
        const name = sender?.displayName?.trim() || 'your friend';
        router.replace('/friends');
        Alert.alert('Welcome to mySplit', `You're now connected with ${name}.`);
      } catch {
        handledRef.current = false;
        await setPendingInviteId(null);
      }
    });

    return () => {
      unsub();
    };
  }, [router]);

  return null;
}
