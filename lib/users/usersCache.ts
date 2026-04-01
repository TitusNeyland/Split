import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import type { UserProfileDoc } from '../profile/profile';

const usersCache = new Map<string, UserProfileDoc | null>();
const inflight = new Map<string, Promise<UserProfileDoc | null>>();

/** Clears cached user doc so the next `getUserData` reads Firestore again. */
export function invalidateUserCache(uid: string): void {
  if (uid) usersCache.delete(uid);
}

/** Merges known fields into the cache (e.g. after updating your own profile photo). */
export function primeUserInCache(uid: string, partial: Partial<UserProfileDoc>): void {
  if (!uid) return;
  const prev = usersCache.get(uid) ?? {};
  usersCache.set(uid, { ...prev, ...partial } as UserProfileDoc);
}

/**
 * In-memory cache of `users/{uid}` for avatars and lightweight member display.
 * Returns `null` when the document does not exist.
 */
export async function getUserData(uid: string): Promise<UserProfileDoc | null> {
  const id = uid?.trim();
  if (!id) return null;
  if (usersCache.has(id)) return usersCache.get(id)!;
  if (inflight.has(id)) return inflight.get(id)!;

  const db = getFirebaseFirestore();
  if (!db) return null;

  const p = (async () => {
    try {
      const snap = await getDoc(doc(db, 'users', id));
      const data = snap.exists() ? (snap.data() as UserProfileDoc) : null;
      usersCache.set(id, data);
      return data;
    } catch {
      usersCache.set(id, null);
      return null;
    }
  })();

  inflight.set(id, p);
  try {
    return await p;
  } finally {
    inflight.delete(id);
  }
}

/** Synchronous peek for hooks; `undefined` means not yet loaded. */
export function getUserDataSync(uid: string): UserProfileDoc | null | undefined {
  if (!uid?.trim()) return null;
  if (!usersCache.has(uid)) return undefined;
  return usersCache.get(uid)!;
}
