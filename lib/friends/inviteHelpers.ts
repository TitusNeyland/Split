import { Timestamp } from 'firebase/firestore';
import type { FirestoreInvite } from './friendSystemFirestore';

export function inviteIsExpired(invite: FirestoreInvite): boolean {
  if (invite.status === 'expired') return true;
  const ex = invite.expiresAt;
  if (ex instanceof Timestamp && ex.toMillis() < Date.now()) return true;
  return false;
}
