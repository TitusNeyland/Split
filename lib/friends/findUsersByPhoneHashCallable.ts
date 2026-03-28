import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase';

export type PhoneHashMatch = {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  username: string;
  /** Which request hash (SHA-256 hex) matched this user’s `users.phoneHash`. */
  requestHash: string;
};

/**
 * Privacy-preserving lookup: only SHA-256 hashes of E.164 numbers are sent.
 * Implemented as callable HTTPS function `findUsersByPhoneHash`.
 */
export async function findUsersByPhoneHashCallable(hashes: string[]): Promise<PhoneHashMatch[]> {
  const fns = getFirebaseFunctions();
  if (!fns) throw new Error('Firebase is not configured.');
  const fn = httpsCallable<{ hashes: string[] }, { matches: PhoneHashMatch[] }>(
    fns,
    'findUsersByPhoneHash'
  );
  const res = await fn({ hashes });
  const data = res.data;
  if (!data || !Array.isArray(data.matches)) return [];
  return data.matches;
}
