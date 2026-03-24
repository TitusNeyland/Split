import * as Crypto from 'expo-crypto';
import {
  Timestamp,
  collection,
  doc,
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
import { getFirebaseFirestore } from './firebase';

export const FRIENDSHIPS_COLLECTION = 'friendships';
export const INVITES_COLLECTION = 'invites';

export type FriendshipConnectedVia = 'split_invite' | 'direct_invite' | 'contacts';

/** Top-level `friendships/{friendshipId}` — written only by Cloud Functions. */
export type FirestoreFriendship = {
  users: [string, string];
  connectedAt: Timestamp;
  connectedVia: FriendshipConnectedVia;
  splitId?: string;
  initiatedBy: string;
};

export type InviteStatus = 'pending' | 'accepted' | 'expired';

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
};

/**
 * Creates `invites/{inviteId}` with `status: pending` and a 7-day `expiresAt`.
 * Phone numbers must already be E.164 before hashing.
 */
export async function createPendingInvite(input: CreatePendingInviteInput): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const inviteId = await generateInviteId();
  const ref = doc(db, INVITES_COLLECTION, inviteId);
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

  await setDoc(ref, payload);
  return inviteId;
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
