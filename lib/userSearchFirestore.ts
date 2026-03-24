import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { normalizeInviteEmail } from './friendSystemFirestore';
import type { UserProfileDoc } from './profile';
import { mergePrivacySettings } from './privacySettings';

export type FriendSearchUserRow = {
  uid: string;
  displayName: string;
  maskedEmail: string;
  avatarUrl: string | null;
  /** For matching pending link/email invites only; not shown in UI. */
  emailNormalized: string | null;
};

/** Masks local part as `t***s@domain.com` when possible. */
export function maskEmailForDisplay(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  const norm = email.trim();
  const at = norm.indexOf('@');
  if (at <= 0) return '';
  const local = norm.slice(0, at);
  const domain = norm.slice(at + 1);
  if (!domain) return '';
  if (local.length <= 1) {
    return `${local || '*'}***@${domain}`;
  }
  if (local.length === 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function isLikelyFullEmailQuery(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isDiscoverableForNameSearch(data: UserProfileDoc): boolean {
  if (data.discoverableByName === false) return false;
  return mergePrivacySettings(data.privacySettings).discoverableByName;
}

function mapUserDoc(snapshot: DocumentSnapshot<DocumentData>): FriendSearchUserRow | null {
  const d = snapshot.data() as UserProfileDoc;
  const displayName =
    typeof d.displayName === 'string' && d.displayName.trim().length > 0
      ? d.displayName.trim()
      : 'mySplit user';
  const email = typeof d.email === 'string' ? d.email : '';
  const normalized =
    typeof d.emailNormalized === 'string' && d.emailNormalized.length > 0
      ? normalizeInviteEmail(d.emailNormalized)
      : email
        ? normalizeInviteEmail(email)
        : null;
  return {
    uid: snapshot.id,
    displayName,
    maskedEmail: maskEmailForDisplay(email || null) || '—',
    avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : null,
    emailNormalized: normalized,
  };
}

/**
 * Prefix match on `displayNameLower` (discoverable users only), or exact match on `emailNormalized`.
 * Requires those fields on `users/{uid}` (see profile save paths). Returns [] when Firestore is off.
 */
export async function searchUsersForFriendConnect(opts: {
  currentUid: string;
  searchText: string;
}): Promise<FriendSearchUserRow[]> {
  const raw = opts.searchText.trim();
  if (raw.length < 3) return [];

  const db = getFirebaseFirestore();
  if (!db) return [];

  const lower = raw.toLowerCase();
  const useEmailBranch = lower.includes('@') && isLikelyFullEmailQuery(lower);

  const byId = new Map<string, FriendSearchUserRow>();

  if (useEmailBranch) {
    const norm = normalizeInviteEmail(lower);
    const q = query(
      collection(db, 'users'),
      where('emailNormalized', '==', norm),
      limit(8)
    );
    const snap = await getDocs(q);
    for (const doc of snap.docs) {
      if (doc.id === opts.currentUid) continue;
      const row = mapUserDoc(doc);
      if (row) byId.set(doc.id, row);
    }
  } else {
    const q = query(
      collection(db, 'users'),
      where('displayNameLower', '>=', lower),
      where('displayNameLower', '<=', `${lower}\uf8ff`),
      limit(30)
    );
    const snap = await getDocs(q);
    for (const doc of snap.docs) {
      if (doc.id === opts.currentUid) continue;
      const data = doc.data() as UserProfileDoc;
      if (!isDiscoverableForNameSearch(data)) continue;
      const row = mapUserDoc(doc);
      if (row) byId.set(doc.id, row);
    }
  }

  return [...byId.values()];
}
