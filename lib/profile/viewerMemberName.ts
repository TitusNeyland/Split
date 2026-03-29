import type { User } from 'firebase/auth';
import type { UserProfileDoc } from './profile';

/**
 * Short given name for the signed-in user (member lists, “you” rows).
 * Fallback: profile.firstName → auth displayName first word → email local part → "You".
 */
export function viewerFirstName(
  profile: UserProfileDoc | null | undefined,
  user: User | null | undefined
): string {
  const fn = profile?.firstName?.trim();
  if (fn) return fn;
  const dn = user?.displayName?.trim();
  if (dn) {
    const first = dn.split(/\s+/).filter(Boolean)[0];
    if (first) return first;
  }
  const em = user?.email?.trim();
  if (em?.includes('@')) {
    const local = em.split('@')[0] ?? '';
    if (local) return local;
  }
  return 'You';
}

export type MemberNameLike = {
  memberId?: string;
  uid?: string;
  displayName?: string | null;
  email?: string | null;
};

/**
 * Plain label for a member row (no “(you)” suffix). For the current user, uses live `viewerFirstNameStr`.
 */
export function getMemberDisplayName(
  member: MemberNameLike,
  currentUid: string | null | undefined,
  viewerFirstNameStr: string
): string {
  const id = member.memberId ?? member.uid ?? '';
  if (currentUid && id === currentUid) {
    return viewerFirstNameStr;
  }
  const dn = typeof member.displayName === 'string' ? member.displayName.trim() : '';
  if (dn) return dn;
  const em = typeof member.email === 'string' ? member.email.trim() : '';
  if (em.includes('@')) {
    const local = em.split('@')[0] ?? '';
    if (local) return local;
  }
  return 'Unknown';
}
