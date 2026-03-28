import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFirestore, getFirebaseStorage } from '../firebase';
import { normalizeInviteEmail } from '../friends/friendSystemFirestore';
import type { NotificationPreferences } from '../notifications/notificationPreferences';
import type { SplitPreferences } from '../split-preferences/splitPreferences';
import type { PrivacySettings } from './privacySettings';

export type UserProfileDoc = {
  /** True after the user finishes the full in-app onboarding flow (9 steps). */
  onboardingComplete?: boolean | null;
  /** When onboarding was marked complete (Firestore server time). */
  onboardingCompletedAt?: { toDate?: () => Date } | null;
  /** Goal ids from onboarding step 2 (`OnboardingGoalId` strings). */
  onboardingGoals?: string[] | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Lowercased display name for prefix search; keep in sync with `displayName`. */
  displayNameLower?: string | null;
  email?: string | null;
  /** Lowercased normalized email for exact-match search. */
  emailNormalized?: string | null;
  /** SHA-256 hex of E.164 phone; set for contact discovery (`findUsersByPhoneHash`). */
  phoneHash?: string | null;
  /** Denormalized from `privacySettings.discoverableByName` for optional indexing. */
  discoverableByName?: boolean | null;
  avatarUrl?: string | null;
  /** Stripe Customer id — card PaymentMethods live only in Stripe. */
  stripeCustomerId?: string | null;
  /** PaymentMethod id from onboarding card capture (token reference only). */
  stripePaymentMethodId?: string | null;
  /** Onboarding attribution survey; analytics only, not shown to other users. */
  acquisitionSource?: string | null;
  /** Push / email toggles; FCM should respect before sending. */
  notificationPreferences?: Partial<NotificationPreferences> | null;
  /** Dispute-reduction defaults for splits (amounts, confirmations, cycle, method). */
  splitPreferences?: Partial<SplitPreferences> | null;
  /** Visibility and export-related privacy toggles; enforce in Firestore rules. */
  privacySettings?: Partial<PrivacySettings> | null;
  /**
   * Per subscription id: when this user last dismissed the price-change banner
   * (Firestore Timestamp). Compared against `subscriptions.priceChangedAt`.
   */
  lastSeenPriceChangeBySubscription?: Record<
    string,
    { toMillis?: () => number; toDate?: () => Date }
  > | null;
  createdAt?: { toDate?: () => Date } | null;
  /**
   * Precomputed lifetime savings from splitting (USD). For each subscription where the user is
   * not the owner: sum of (full plan cost − their share) × paid billing cycles. Update via Cloud
   * Function / backend when payments are applied.
   */
  lifetime_saved?: number | null;
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

  const email = user.email ?? user.providerData[0]?.email ?? null;
  await setDoc(
    doc(db, 'users', uid),
    {
      avatarUrl: url,
      email,
      emailNormalized: email ? normalizeInviteEmail(email) : null,
      displayName: user.displayName ?? null,
      displayNameLower: user.displayName?.trim()
        ? user.displayName.trim().toLowerCase()
        : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return url;
}

export async function removeProfileAvatar(): Promise<void> {
  const auth = getFirebaseAuth();
  const storage = getFirebaseStorage();
  const db = getFirebaseFirestore();
  if (!auth || !storage || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to update your profile photo.');

  const uid = user.uid;
  const storageRef = ref(storage, `users/${uid}/avatar.jpg`);
  try {
    await deleteObject(storageRef);
  } catch (e: unknown) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: string }).code) : '';
    if (code !== 'storage/object-not-found') throw e;
  }

  await setDoc(
    doc(db, 'users', uid),
    {
      avatarUrl: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveUserDisplayName(displayName: string): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to edit your profile.');

  await updateProfile(user, { displayName: displayName.trim() || null });
  const trimmed = displayName.trim();
  await setDoc(
    doc(db, 'users', user.uid),
    {
      displayName: trimmed || null,
      displayNameLower: trimmed ? trimmed.toLowerCase() : null,
      email: user.email ?? null,
      emailNormalized: user.email ? normalizeInviteEmail(user.email) : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Onboarding: Auth displayName + Firestore displayName, displayNameLower, firstName, lastName. */
export async function saveOnboardingLegalName(firstName: string, lastName: string): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');

  const first = firstName.trim();
  const last = lastName.trim();
  const displayName = `${first} ${last}`.trim();

  await updateProfile(user, { displayName });
  await setDoc(
    doc(db, 'users', user.uid),
    {
      displayName,
      displayNameLower: displayName ? displayName.toLowerCase() : null,
      firstName: first,
      lastName: last,
      email: user.email ?? null,
      emailNormalized: user.email ? normalizeInviteEmail(user.email) : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function savePrivacySettings(settings: PrivacySettings): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to update privacy settings.');

  await setDoc(
    doc(db, 'users', user.uid),
    {
      privacySettings: settings,
      discoverableByName: settings.discoverableByName,
      email: user.email ?? null,
      emailNormalized: user.email ? normalizeInviteEmail(user.email) : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveSplitPreferences(prefs: SplitPreferences): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth || !db) throw new Error('Firebase is not configured.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to update split preferences.');

  await setDoc(
    doc(db, 'users', user.uid),
    {
      splitPreferences: prefs,
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
