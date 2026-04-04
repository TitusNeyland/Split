/**
 * TEMP: Device-only avatar while Firebase is not configured.
 * See removal checklist in `lib/profile/localProfileAvatarStorage.ts` (search: LOCAL_PROFILE_AVATAR_OFFLINE).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { isFirebaseConfigured } from '../lib/firebase';
import {
  deleteLocalProfileAvatarFile,
  getLocalAvatarFileUri,
  localProfileAvatarFileExists,
  saveLocalProfileAvatarFile,
} from '../lib/profile';

type Value = {
  /** file:// URI when a local-only avatar exists (Firebase off). */
  localAvatarUri: string | null;
  /** True after we’ve checked disk (or skipped when Firebase is on). */
  localAvatarHydrated: boolean;
  persistLocalAvatar: (processedImageUri: string) => Promise<void>;
  clearLocalAvatar: () => Promise<void>;
};

export const LocalProfileAvatarContext = createContext<Value | null>(null);

export function LocalProfileAvatarProvider({ children }: { children: ReactNode }) {
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [localAvatarHydrated, setLocalAvatarHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isFirebaseConfigured()) {
        if (!cancelled) {
          setLocalAvatarUri(null);
          setLocalAvatarHydrated(true);
        }
        return;
      }
      const exists = await localProfileAvatarFileExists();
      const path = getLocalAvatarFileUri();
      if (!cancelled) {
        setLocalAvatarUri(exists && path ? path : null);
        setLocalAvatarHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistLocalAvatar = useCallback(async (processedImageUri: string) => {
    const uri = await saveLocalProfileAvatarFile(processedImageUri);
    setLocalAvatarUri(uri);
  }, []);

  const clearLocalAvatar = useCallback(async () => {
    await deleteLocalProfileAvatarFile();
    setLocalAvatarUri(null);
  }, []);

  const value = useMemo(
    () => ({
      localAvatarUri,
      localAvatarHydrated,
      persistLocalAvatar,
      clearLocalAvatar,
    }),
    [localAvatarUri, localAvatarHydrated, persistLocalAvatar, clearLocalAvatar]
  );

  return (
    <LocalProfileAvatarContext.Provider value={value}>{children}</LocalProfileAvatarContext.Provider>
  );
}

export function useLocalProfileAvatar(): Value {
  const ctx = useContext(LocalProfileAvatarContext);
  if (!ctx) {
    throw new Error('LocalProfileAvatarProvider is missing from the tree.');
  }
  return ctx;
}
