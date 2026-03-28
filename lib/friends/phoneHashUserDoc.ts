import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from '../firebase';
import { sha256HexUtf8Js } from './phoneHashClient';

/**
 * Ensures `users/{uid}.phoneHash` matches Auth phone (SHA-256 of E.164).
 * Call after sign-in so contact discovery can find this user via `findUsersByPhoneHash`.
 */
export async function ensurePhoneHashOnUserDoc(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) return;
  const u = auth.currentUser;
  const raw = u?.phoneNumber?.trim();
  if (!raw) return;

  const phoneHash = sha256HexUtf8Js(raw);
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref);
  const existing =
    snap.exists() && typeof (snap.data() as { phoneHash?: string }).phoneHash === 'string'
      ? (snap.data() as { phoneHash: string }).phoneHash
      : null;
  if (existing === phoneHash) return;

  await setDoc(
    ref,
    {
      phoneHash,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
