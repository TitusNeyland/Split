import { useContext, useEffect, useState } from 'react';
import { isFirebaseConfigured } from '../../lib/firebase';
import { subscribeAuthAndProfile } from '../../lib/profile';
import { LocalProfileAvatarContext } from '../contexts/LocalProfileAvatarContext';

// LOCAL_PROFILE_AVATAR_OFFLINE — when Firebase is always on, drop context + fallback below; return only Firestore `avatarUrl`.
/** Firestore avatar when Firebase is on; otherwise persisted local file (device-only). */
export function useProfileAvatarUrl(): {
  avatarUrl: string | null;
  displayName: string | null;
  profileLoading: boolean;
  hasSignedInUser: boolean;
  localAvatarHydrated: boolean;
  persistLocalAvatar: (processedImageUri: string) => Promise<void>;
  clearLocalAvatar: () => Promise<void>;
} {
  const localCtx = useContext(LocalProfileAvatarContext);
  const [firebaseAvatarUrl, setFirebaseAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [hasSignedInUser, setHasSignedInUser] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setFirebaseAvatarUrl(null);
      setDisplayName(null);
      setProfileLoading(false);
      setHasSignedInUser(false);
      return;
    }
    return subscribeAuthAndProfile((s) => {
      setHasSignedInUser(Boolean(s.user));
      const dn = s.profile?.displayName ?? s.user?.displayName ?? null;
      setDisplayName(typeof dn === 'string' && dn.trim() ? dn.trim() : null);
      setFirebaseAvatarUrl(s.profile?.avatarUrl ?? null);
      setProfileLoading(Boolean(s.user) && s.profileLoading);
    });
  }, []);

  // LOCAL_PROFILE_AVATAR_OFFLINE — remove this fallback when provider is guaranteed (or delete offline path entirely).
  const fallback = {
    localAvatarUri: null as string | null,
    localAvatarHydrated: true,
    persistLocalAvatar: async () => {},
    clearLocalAvatar: async () => {},
  };
  const local = localCtx ?? fallback;

  // LOCAL_PROFILE_AVATAR_OFFLINE — simplify to `firebaseAvatarUrl` only after removing local storage.
  const avatarUrl = isFirebaseConfigured() ? firebaseAvatarUrl : local.localAvatarUri;

  return {
    avatarUrl,
    displayName,
    profileLoading,
    hasSignedInUser,
    localAvatarHydrated: local.localAvatarHydrated,
    persistLocalAvatar: local.persistLocalAvatar,
    clearLocalAvatar: local.clearLocalAvatar,
  };
}
