/**
 * TEMP: Offline profile photo when Firebase env vars are missing.
 *
 * After Firebase is configured for all builds you care about, you can remove:
 * - This file (`localProfileAvatarStorage.ts`)
 * - `app/contexts/LocalProfileAvatarContext.tsx`
 * - `LocalProfileAvatarProvider` in `app/_layout.tsx`
 * - Local branches / `persistLocalAvatar` / `clearLocalAvatar` / `localAvatarHydrated` in
 *   `app/hooks/useProfileAvatarUrl.ts` and `app/(tabs)/profile.tsx`
 *
 * Search: LOCAL_PROFILE_AVATAR_OFFLINE
 */
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
} from 'expo-file-system/legacy';

const FILENAME = 'split_local_profile_avatar.jpg';

export function getLocalAvatarFileUri(): string {
  const base = documentDirectory;
  if (!base) return '';
  return `${base}${FILENAME}`;
}

/** Copies a cropped image into app storage so it survives until you add Firebase or clear it. */
export async function saveLocalProfileAvatarFile(sourceUri: string): Promise<string> {
  const dest = getLocalAvatarFileUri();
  if (!dest) throw new Error('App storage is not available.');
  await copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function deleteLocalProfileAvatarFile(): Promise<void> {
  const dest = getLocalAvatarFileUri();
  if (!dest) return;
  try {
    const info = await getInfoAsync(dest);
    if (info.exists) {
      await deleteAsync(dest, { idempotent: true });
    }
  } catch {
    /* ignore */
  }
}

export async function localProfileAvatarFileExists(): Promise<boolean> {
  const dest = getLocalAvatarFileUri();
  if (!dest) return false;
  try {
    const info = await getInfoAsync(dest);
    return info.exists;
  } catch {
    return false;
  }
}
