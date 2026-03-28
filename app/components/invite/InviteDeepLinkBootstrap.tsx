import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { extractInviteIdFromUrl } from '../../../lib/friends/inviteLinks';

/**
 * Handles cold start and foreground URLs pointing at `/invite/{id}` (universal links or custom scheme).
 */
export default function InviteDeepLinkBootstrap() {
  const router = useRouter();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      const id = extractInviteIdFromUrl(url);
      if (!id || seenRef.current.has(id)) return;
      seenRef.current.add(id);
      router.push(`/invite/${id}`);
    };

    const sub = Linking.addEventListener('url', ({ url }) => {
      handle(url);
    });

    Linking.getInitialURL().then(handle);

    return () => {
      sub.remove();
    };
  }, [router]);

  return null;
}
