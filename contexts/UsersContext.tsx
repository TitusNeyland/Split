import { useMemo } from 'react';
import { getUserData, invalidateUserCache, primeUserInCache } from '../lib/users/usersCache';

/**
 * Lightweight access to the shared users document cache (same helpers as `getUserData` in `lib/users/usersCache`).
 */
export function useUsersCache() {
  return useMemo(
    () => ({
      getUserData,
      primeUserInCache,
      invalidateUserCache,
    }),
    []
  );
}

export { getUserData, invalidateUserCache, primeUserInCache } from '../lib/users/usersCache';
export { useUserProfile } from '../hooks/useUserProfile';
