import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { ONBOARDING_GOALS_STORAGE_KEY } from './onboardingGoals';

export const ONBOARDING_COMPLETE_STORAGE_KEY = '@split/onboarding_complete';
export const ONBOARDING_NAME_SAVED_KEY = '@split/onboarding_name_saved';
export const ONBOARDING_EMAIL_SAVED_KEY = '@split/onboarding_email_saved';
/** Email string from step 4 for `createUserWithEmailAndPassword` / link on step 5. */
export const ONBOARDING_SIGNUP_EMAIL_KEY = '@split/onboarding_signup_email';
export const ONBOARDING_PASSWORD_SAVED_KEY = '@split/onboarding_password_saved';
export const ONBOARDING_NOTIFICATIONS_DONE_KEY = '@split/onboarding_notifications_done';
export const ONBOARDING_PAYMENT_DONE_KEY = '@split/onboarding_payment_done';
export const ONBOARDING_FIND_US_DONE_KEY = '@split/onboarding_find_us_done';
/** Set on email Continue; after account creation, copy into `BIOMETRIC_ENABLED_STORAGE_KEY` via `commitPendingBiometricToEnabledFlag`. */
export const ONBOARDING_BIOMETRIC_PENDING_KEY = '@split/onboarding_biometric_pending';
export const BIOMETRIC_ENABLED_STORAGE_KEY = '@split/biometric_enabled';

export async function getOnboardingCompleteFromStorage(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_COMPLETE_STORAGE_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingNameSaved(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_NAME_SAVED_KEY, 'true');
}

export async function hasOnboardingNameSaved(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_NAME_SAVED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingEmailSaved(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_EMAIL_SAVED_KEY, 'true');
}

export async function setOnboardingSignupEmail(email: string): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_SIGNUP_EMAIL_KEY, email.trim());
}

export async function setOnboardingPasswordSaved(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_PASSWORD_SAVED_KEY, 'true');
}

export async function hasOnboardingPasswordSaved(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_PASSWORD_SAVED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingNotificationsStepDone(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_NOTIFICATIONS_DONE_KEY, 'true');
}

export async function hasOnboardingNotificationsStepDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_NOTIFICATIONS_DONE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingPaymentStepDone(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_PAYMENT_DONE_KEY, 'true');
}

export async function hasOnboardingPaymentStepDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_PAYMENT_DONE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingFindUsStepDone(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_FIND_US_DONE_KEY, 'true');
}

export async function hasOnboardingFindUsStepDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_FIND_US_DONE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function hasOnboardingEmailSaved(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_EMAIL_SAVED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingBiometricPending(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_BIOMETRIC_PENDING_KEY, enabled ? 'true' : 'false');
}

/**
 * After email/password account creation, persist the onboarding Face ID choice to AsyncStorage.
 * Clears the pending key set on the email step.
 */
export async function commitPendingBiometricToEnabledFlag(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_BIOMETRIC_PENDING_KEY);
    if (v === null) return;
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_STORAGE_KEY, v);
    await AsyncStorage.removeItem(ONBOARDING_BIOMETRIC_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export async function setOnboardingCompleteInStorage(complete: boolean): Promise<void> {
  if (complete) {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_STORAGE_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_STORAGE_KEY);
  }
}

/** Writes `onboardingComplete` on the user profile doc (call after all onboarding steps). */
export async function setOnboardingCompleteInFirestore(uid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid),
    { onboardingComplete: true, onboardingCompletedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Persists completion locally and, when signed in, on Firestore. */
export async function markOnboardingFullyComplete(uid: string | null): Promise<void> {
  await setOnboardingCompleteInStorage(true);
  await AsyncStorage.removeItem(ONBOARDING_GOALS_STORAGE_KEY);
  await AsyncStorage.removeItem(ONBOARDING_NAME_SAVED_KEY);
  await AsyncStorage.removeItem(ONBOARDING_EMAIL_SAVED_KEY);
  await AsyncStorage.removeItem(ONBOARDING_SIGNUP_EMAIL_KEY);
  await AsyncStorage.removeItem(ONBOARDING_PASSWORD_SAVED_KEY);
  await AsyncStorage.removeItem(ONBOARDING_NOTIFICATIONS_DONE_KEY);
  await AsyncStorage.removeItem(ONBOARDING_PAYMENT_DONE_KEY);
  await AsyncStorage.removeItem(ONBOARDING_FIND_US_DONE_KEY);
  await AsyncStorage.removeItem(ONBOARDING_BIOMETRIC_PENDING_KEY);
  if (uid) await setOnboardingCompleteInFirestore(uid);
}
