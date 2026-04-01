import { useEffect, useState } from 'react';
import type { UserProfileDoc } from '../../lib/profile/profile';
import { getUserData, getUserDataSync } from '../../lib/users/usersCache';

/**
 * Loads `users/{uid}` once per uid (backed by shared in-memory cache).
 * When `uid` is null/undefined, returns `{ profile: null, loading: false }`.
 */
export function useUserProfile(uid: string | null | undefined): {
  profile: UserProfileDoc | null;
  loading: boolean;
} {
  const [profile, setProfile] = useState<UserProfileDoc | null>(() => {
    if (!uid) return null;
    const sync = getUserDataSync(uid);
    return sync === undefined ? null : sync;
  });
  const [loading, setLoading] = useState(() => Boolean(uid && getUserDataSync(uid) === undefined));

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const sync = getUserDataSync(uid);
    if (sync !== undefined) {
      setProfile(sync);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    getUserData(uid).then((d) => {
      if (!cancelled) {
        setProfile(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { profile, loading };
}
