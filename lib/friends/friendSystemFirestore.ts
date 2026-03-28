import * as Crypto from 'expo-crypto';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

export const FRIENDSHIPS_COLLECTION = 'friendships';
export const INVITES_COLLECTION = 'invites';
/** Doc id = SHA-256 hex of E.164 phone; readable by any signed-in user for contact matching. */
export const CONTACT_PHONE_INDEX_COLLECTION = 'contact_phone_index';

export type FriendshipConnectedVia =
  | 'split_invite'
  | 'direct_invite'
  | 'contacts'
  | 'user_search'
  | 'search';

/**
 * Top-level `friendships/{friendshipId}`.
 * Prefer creating these via Cloud Functions + security rules; the client helper below exists for
 * early development and must be allowed by your rules if used in production.
 */
export type FirestoreFriendship = {
  users: [string, string];
  connectedAt: Timestamp;
  connectedVia: FriendshipConnectedVia;
  splitId?: string;
  initiatedBy: string;
};

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'declined';

/** `invites/{inviteId}` — `inviteId` matches document id (deep link). */
export type FirestoreInvite = {
  inviteId: string;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  recipientPhone?: string;
  recipientEmail?: string;
  splitId?: string;
  /** Hint for friendship `connectedVia` when the invite is accepted. */
  connectedVia?: FriendshipConnectedVia;
  status: InviteStatus;
  acceptedBy?: string;
  acceptedAt?: Timestamp;
  declinedBy?: string;
  declinedAt?: Timestamp;
  /** Snapshot at invite creation for the accept screen (invitee cannot query sender's data). */
  senderActiveSplits?: number;
  senderFriendCount?: number;
};

/** `users/{uid}/contacts/{docId}` — doc id is usually `phoneHash` for dedup. */
export type FirestoreContactRow = {
  phoneHash: string;
  name: string;
  addedAt: Timestamp;
};

const friendshipConverter: FirestoreDataConverter<FirestoreFriendship> = {
  toFirestore(value): DocumentData {
    return { ...value };
  },
  fromFirestore(snapshot, options) {
    return snapshot.data(options) as FirestoreFriendship;
  },
};

export function sortFriendUids(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Same id strategy as Cloud Functions (`uidSmall_uidLarge`). */
export function friendshipDocId(uidA: string, uidB: string): string {
  const [x, y] = sortFriendUids(uidA, uidB);
  return `${x}_${y}`;
}

export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** SHA-256 hex of UTF-8 string (use E.164 for phone numbers). */
export async function sha256HexUtf8(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export async function generateInviteId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CreatePendingInviteInput = {
  creatorUid: string;
  splitId?: string;
  /** E.164; stored as SHA-256 hex. */
  recipientE164?: string;
  recipientEmailRaw?: string;
  connectedVia?: FriendshipConnectedVia;
  /** Stored on the invite doc for recipients who cannot read the sender's collections. */
  senderActiveSplits?: number;
  senderFriendCount?: number;
};

/**
 * Creates `invites/{inviteId}` with `status: pending` and a 7-day `expiresAt`.
 * Uses a new Firestore doc id (`doc(collection()).id`), equivalent to `addDoc`, so links are
 * `https://…/invite/{inviteId}`.
 * Phone numbers must already be E.164 before hashing.
 */
export async function createPendingInvite(input: CreatePendingInviteInput): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const ref = doc(collection(db, INVITES_COLLECTION));
  const inviteId = ref.id;
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);

  let connectedVia = input.connectedVia;
  if (!connectedVia) {
    connectedVia = input.splitId ? 'split_invite' : 'direct_invite';
  }

  const payload: Record<string, unknown> = {
    inviteId,
    createdBy: input.creatorUid,
    createdAt: serverTimestamp(),
    expiresAt,
    status: 'pending' satisfies InviteStatus,
    connectedVia,
  };

  if (input.splitId) payload.splitId = input.splitId;
  if (input.recipientE164) {
    payload.recipientPhone = await sha256HexUtf8(input.recipientE164);
  }
  if (input.recipientEmailRaw) {
    payload.recipientEmail = normalizeInviteEmail(input.recipientEmailRaw);
  }
  if (typeof input.senderActiveSplits === 'number' && Number.isFinite(input.senderActiveSplits)) {
    payload.senderActiveSplits = Math.max(0, Math.round(input.senderActiveSplits));
  }
  if (typeof input.senderFriendCount === 'number' && Number.isFinite(input.senderFriendCount)) {
    payload.senderFriendCount = Math.max(0, Math.round(input.senderFriendCount));
  }

  await setDoc(ref, payload);
  return inviteId;
}

export async function declinePendingInvite(inviteId: string, declinerUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, INVITES_COLLECTION, inviteId), {
    status: 'declined' satisfies InviteStatus,
    declinedBy: declinerUid,
    declinedAt: serverTimestamp(),
  });
}

export async function acceptPendingInvite(inviteId: string, accepterUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, INVITES_COLLECTION, inviteId), {
    status: 'accepted' satisfies InviteStatus,
    acceptedBy: accepterUid,
    acceptedAt: serverTimestamp(),
  });
}

export async function fetchInviteById(inviteId: string): Promise<FirestoreInvite | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  const snap = await getDoc(doc(db, INVITES_COLLECTION, inviteId));
  if (!snap.exists()) return null;
  return snap.data() as FirestoreInvite;
}

export type InviteSenderProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Timestamp | null;
  lifetimeSaved: number | null;
};

export async function fetchUserProfileForInvite(uid: string): Promise<InviteSenderProfile | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  const displayName = typeof d.displayName === 'string' ? d.displayName : null;
  const avatarUrl = typeof d.avatarUrl === 'string' ? d.avatarUrl : null;
  const createdAt = d.createdAt instanceof Timestamp ? d.createdAt : null;
  const ls = d.lifetime_saved;
  const lifetimeSaved = typeof ls === 'number' && Number.isFinite(ls) ? ls : null;
  return { displayName, avatarUrl, createdAt, lifetimeSaved };
}

/** Query used for friend lists (requires composite index: users ARRAY + connectedAt DESC). */
export function friendsQueryForUid(uid: string) {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  return query(
    collection(db, FRIENDSHIPS_COLLECTION).withConverter(friendshipConverter),
    where('users', 'array-contains', uid),
    orderBy('connectedAt', 'desc')
  );
}

/**
 * Creates an accepted friendship immediately (used after in-app user search → Connect).
 * Idempotent: returns `already` if `friendships/{uidSmall_uidLarge}` already exists.
 */
export async function createDirectFriendshipFromSearch(input: {
  currentUid: string;
  otherUid: string;
  /** Defaults to Find People (`search`). Use `contacts` for address-book discovery. */
  connectedVia?: Extract<FriendshipConnectedVia, 'search' | 'contacts'>;
}): Promise<'created' | 'already'> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  if (input.currentUid === input.otherUid) throw new Error('Invalid friend.');

  const via: FriendshipConnectedVia = input.connectedVia ?? 'search';

  const id = friendshipDocId(input.currentUid, input.otherUid);
  const existing = await getDoc(doc(db, FRIENDSHIPS_COLLECTION, id));
  if (existing.exists()) return 'already';

  const [a, b] = sortFriendUids(input.currentUid, input.otherUid);
  await setDoc(doc(db, FRIENDSHIPS_COLLECTION, id), {
    users: [a, b],
    connectedAt: serverTimestamp(),
    connectedVia: via,
    initiatedBy: input.currentUid,
  });
  return 'created';
}

/** Normalized emails the current user has already invited (pending). */
export async function fetchOutgoingPendingInviteEmails(creatorUid: string): Promise<Set<string>> {
  const db = getFirebaseFirestore();
  if (!db) return new Set();
  try {
    const q = query(
      collection(db, INVITES_COLLECTION),
      where('createdBy', '==', creatorUid),
      where('status', '==', 'pending' satisfies InviteStatus)
    );
    const snap = await getDocs(q);
    const out = new Set<string>();
    for (const d of snap.docs) {
      const em = (d.data() as FirestoreInvite).recipientEmail;
      if (typeof em === 'string' && em.length > 0) out.add(normalizeInviteEmail(em));
    }
    return out;
  } catch {
    return new Set();
  }
}

export type OutgoingPendingInviteSummary = {
  inviteId: string;
  recipientLabel: string;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
};

export async function fetchOutgoingPendingInvites(
  creatorUid: string
): Promise<OutgoingPendingInviteSummary[]> {
  const db = getFirebaseFirestore();
  if (!db) return [];
  try {
    const q = query(
      collection(db, INVITES_COLLECTION),
      where('createdBy', '==', creatorUid),
      where('status', '==', 'pending' satisfies InviteStatus)
    );
    const snap = await getDocs(q);
    const rows: OutgoingPendingInviteSummary[] = [];
    for (const d of snap.docs) {
      const data = d.data() as FirestoreInvite;
      const label =
        typeof data.recipientEmail === 'string' && data.recipientEmail.length > 0
          ? data.recipientEmail
          : 'Invite link';
      rows.push({
        inviteId: d.id,
        recipientLabel: label,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
        expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt : null,
      });
    }
    rows.sort((a, b) => {
      const am = a.createdAt?.toMillis() ?? 0;
      const bm = b.createdAt?.toMillis() ?? 0;
      return bm - am;
    });
    return rows;
  } catch {
    return [];
  }
}

export async function expirePendingInvite(inviteId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, INVITES_COLLECTION, inviteId), {
    status: 'expired' satisfies InviteStatus,
  });
}

export async function deleteFriendshipBetween(currentUid: string, otherUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const id = friendshipDocId(currentUid, otherUid);
  await deleteDoc(doc(db, FRIENDSHIPS_COLLECTION, id));
}

export function subscribeFriendships(
  uid: string,
  onNext: (docs: QueryDocumentSnapshot<FirestoreFriendship>[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let unsub: Unsubscribe = () => {};
  try {
    const q = friendsQueryForUid(uid);
    unsub = onSnapshot(
      q,
      (snap) => onNext(snap.docs),
      (e) => onError?.(e instanceof Error ? e : new Error(String(e)))
    );
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
  }
  return unsub;
}

export function contactsCollectionRef(uid: string) {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  return collection(db, 'users', uid, 'contacts');
}

/** Upserts one hashed contact row; `phoneHash` is typically SHA-256 hex of E.164. */
export async function upsertUserContact(opts: {
  uid: string;
  phoneHash: string;
  name: string;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const ref = doc(db, 'users', opts.uid, 'contacts', opts.phoneHash);
  await setDoc(
    ref,
    {
      phoneHash: opts.phoneHash,
      name: opts.name,
      addedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export type ContactPhoneIndexDoc = {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  updatedAt?: Timestamp;
};

/** Registers this device's phone hash so contact discovery can find this user (first-write wins per hash). */
export async function upsertContactPhoneIndexForUser(opts: {
  uid: string;
  phoneE164: string;
  displayName: string;
  avatarUrl: string | null;
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  const hash = await sha256HexUtf8(opts.phoneE164.trim());
  const ref = doc(db, CONTACT_PHONE_INDEX_COLLECTION, hash);
  await setDoc(
    ref,
    {
      uid: opts.uid,
      displayName: opts.displayName.trim() || 'mySplit user',
      avatarUrl: opts.avatarUrl ?? null,
      updatedAt: serverTimestamp(),
    } as ContactPhoneIndexDoc,
    { merge: true }
  );
}

/**
 * Looks up other users who registered the same phone hash (see `upsertContactPhoneIndexForUser`).
 */
export async function lookupUsersByPhoneHashes(
  hashes: string[],
  excludeUid: string
): Promise<{ uid: string; displayName: string; avatarUrl: string | null }[]> {
  const db = getFirebaseFirestore();
  if (!db || hashes.length === 0) return [];
  const uniq = [...new Set(hashes)].filter(Boolean);
  const out: { uid: string; displayName: string; avatarUrl: string | null }[] = [];
  const seenUids = new Set<string>();
  await Promise.all(
    uniq.map(async (hash) => {
      const snap = await getDoc(doc(db, CONTACT_PHONE_INDEX_COLLECTION, hash));
      if (!snap.exists()) return;
      const d = snap.data() as ContactPhoneIndexDoc;
      const uid = typeof d.uid === 'string' ? d.uid : '';
      if (!uid || uid === excludeUid) return;
      if (seenUids.has(uid)) return;
      seenUids.add(uid);
      out.push({
        uid,
        displayName: typeof d.displayName === 'string' && d.displayName.trim() ? d.displayName : 'Friend',
        avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : null,
      });
    })
  );
  return out;
}

/** Active `subscriptions` docs (memberUids or members contains uid, status active). */
export async function countActiveSubscriptionsForUser(uid: string): Promise<number> {
  const db = getFirebaseFirestore();
  if (!db) return 0;
  try {
    const q1 = query(collection(db, 'subscriptions'), where('memberUids', 'array-contains', uid));
    const q2 = query(collection(db, 'subscriptions'), where('members', 'array-contains', uid));
    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const seen = new Set<string>();
    let n = 0;
    for (const d of [...s1.docs, ...s2.docs]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const st = String((d.data() as { status?: string }).status ?? 'active').toLowerCase();
      if (st === 'active') n++;
    }
    return n;
  } catch {
    return 0;
  }
}

export async function countFriendshipsForUser(uid: string): Promise<number> {
  const db = getFirebaseFirestore();
  if (!db) return 0;
  try {
    const q = query(collection(db, FRIENDSHIPS_COLLECTION), where('users', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.size;
  } catch {
    return 0;
  }
}
