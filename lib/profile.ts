import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFirestore, getFirebaseStorage } from './firebase';
import type { NotificationPreferences } from './notificationPreferences';

export type UserProfileDoc = {
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  /** Stripe Customer id — card PaymentMethods live only in Stripe. */
  stripeCustomerId?: string | null;
  /** Push / email toggles; FCM should respect before sending. */
  notificationPreferences?: Partial<NotificationPreferences> | null;
  createdAt?: { toDate?: () => Date } | null;
};

export function initialsFromName(name: string | null | undefined): string {
  const t = name?.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0];
    const b = parts[1]![0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export function formatMemberSince(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return 'Member recently';
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `Member since ${label}`;
}

export function subscribeAuthAndProfile(
  onData: (state: {
    uid: string | null;
    user: User | null;
    profile: UserProfileDoc | null;
    profileLoading: boolean;
  }) => void
): () => void {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) {
    onData({ uid: null, user: null, profile: null, profileLoading: false });
    return () => {};
  }

  let profileUnsub: Unsubscribe | null = null;

  const tearDownProfile = () => {
    profileUnsub?.();
    profileUnsub = null;
  };

  const authUnsub = onAuthStateChanged(auth, (user) => {
    tearDownProfile();

    if (!user) {
      onData({ uid: null, user: null, profile: null, profileLoading: false });
      return;
    }

    onData({ uid: user.uid, user, profile: null, profileLoading: true });
    const r = doc(db, 'users', user.uid);
    profileUnsub = onSnapshot(
      r,
      (snap) => {
        onData({
          uid: user.uid,
          user,
          profile: snap.exists() ? (snap.data() as UserProfileDoc) : {},
          profileLoading: false,
        });
      },
      () => {
        onData({ uid: user.uid, user, profile: {}, profileLoading: false });
      }
    );
  });

  return () => {
    tearDownProfile();
    authUnsub();
  };
}

async function ensureUserForUpload(): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  if (!cred.user) throw new Error('Could not sign in.');
  await setDoc(
    doc(getFirebaseFirestore()!, 'users', cred.user.uid),
    { createdAt: serverTimestamp() },
    { merge: true }
  );
  return cred.user;
}

export async function uploadProfileAvatar(localUri: string): Promise<string> {
  const storage = getFirebaseStorage();
  const db = getFirebaseFirestore();
  if (!storage || !db) throw new Error('Firebase is not configured.');

  const user = await ensureUserForUpload();
  const uid = user.uid;

  const response = await fetch(localUri);
  const blob = await response.blob();
  const path = `users/${uid}/avatar.jpg`;
  const storageRef = ref(storage, path);
  const contentType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  await uploadBytes(storageRef, blob, { contentType });
  const url = await getDownloadURL(storageRef);

  await setDoc(
    doc(db, 'users', uid),
    {
      avatarUrl: url,
      email: user.email ?? user.providerData[0]?.email ?? null,
      displayName: user.displayName ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return url;
}

export async function saveUserDisplayName(displayName: string): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to edit your profile.');

  await updateProfile(user, { displayName: displayName.trim() || null });
  await setDoc(
    doc(db, 'users', user.uid),
    {
      displayName: displayName.trim() || null,
      email: user.email ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to update notification settings.');

  await setDoc(
    doc(db, 'users', user.uid),
    {
      notificationPreferences: prefs,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveStripeCustomerId(customerId: string): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to save a payment method.');

  await setDoc(
    doc(db, 'users', user.uid),
    {
      stripeCustomerId: customerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
