import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

export const ONBOARDING_COMPLETE_STORAGE_KEY = '@split/onboarding_complete';

export async function getOnboardingCompleteFromStorage(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_COMPLETE_STORAGE_KEY);
    return v === 'true';
  } catch {
    return false;
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
    { onboardingComplete: true },
    { merge: true }
  );
}

/** Persists completion locally and, when signed in, on Firestore. */
export async function markOnboardingFullyComplete(uid: string | null): Promise<void> {
  await setOnboardingCompleteInStorage(true);
  if (uid) await setOnboardingCompleteInFirestore(uid);
}
