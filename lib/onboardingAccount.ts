import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './firebase';
import { normalizeInviteEmail } from './friendSystemFirestore';
import { ONBOARDING_GOALS_STORAGE_KEY } from './onboardingGoals';
import { ONBOARDING_SIGNUP_EMAIL_KEY } from './onboardingStorage';

/**
 * Anonymous onboarding users upgrade via link; cold start with no session uses createUser.
 */
export async function createOrLinkOnboardingEmailPassword(
  email: string,
  password: string
): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured.');

  const trimmedEmail = email.trim();
  const cred = EmailAuthProvider.credential(trimmedEmail, password);

  if (auth.currentUser?.isAnonymous) {
    const { user } = await linkWithCredential(auth.currentUser, cred);
    return user;
  }

  if (!auth.currentUser) {
    const { user } = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    return user;
  }

  // Already signed in (non-anonymous), e.g. restored session from Sign in — don't create/link again.
  const existing = auth.currentUser;
  const existingEmail = existing.email?.trim().toLowerCase() ?? '';
  if (existingEmail && existingEmail === trimmedEmail.toLowerCase()) {
    return existing;
  }

  const err = new Error(
    'You are signed in with a different account. Sign out from Settings or the sign-in screen, then try again.'
  ) as Error & { code?: string };
  err.code = 'auth/onboarding-session-mismatch';
  throw err;
}

/** Merge email + onboarding goals onto `users/{uid}` after password step. */
export async function mergeOnboardingUserDocAfterSignup(uid: string): Promise<void> {
  const db = getFirebaseFirestore();
  const auth = getFirebaseAuth();
  if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) return;

  const user = auth.currentUser;
  let goals: string[] | undefined;
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_GOALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        goals = parsed;
      }
    }
  } catch {
    /* ignore */
  }

  await setDoc(
    doc(db, 'users', uid),
    {
      email: user.email ?? null,
      emailNormalized: user.email ? normalizeInviteEmail(user.email) : null,
      ...(goals && goals.length > 0 ? { onboardingGoals: goals } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function readStoredSignupEmail(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ONBOARDING_SIGNUP_EMAIL_KEY);
  } catch {
    return null;
  }
}
