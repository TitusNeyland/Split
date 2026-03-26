import { signInAnonymously } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './firebase';

export const ONBOARDING_GOALS_STORAGE_KEY = '@split/onboarding_goals_draft';

export const ONBOARDING_GOAL_IDS = [
  'split_subscriptions',
  'scan_receipts',
  'split_roommates',
  'collect_owed',
  'track_group_expenses',
] as const;

export type OnboardingGoalId = (typeof ONBOARDING_GOAL_IDS)[number];

export type OnboardingGoalOption = {
  id: OnboardingGoalId;
  label: string;
  defaultSelected: boolean;
  iconBg: string;
  iconColor: string;
};

export const ONBOARDING_GOAL_OPTIONS: readonly OnboardingGoalOption[] = [
  {
    id: 'split_subscriptions',
    label: 'Split subscriptions',
    defaultSelected: true,
    iconBg: '#EEEDFE',
    iconColor: '#534AB7',
  },
  {
    id: 'scan_receipts',
    label: 'Scan receipts',
    defaultSelected: true,
    iconBg: '#E1F5EE',
    iconColor: '#0F6E56',
  },
  {
    id: 'split_roommates',
    label: 'Split with roommates',
    defaultSelected: false,
    iconBg: '#FAEEDA',
    iconColor: '#854F0B',
  },
  {
    id: 'collect_owed',
    label: "Collect money I'm owed",
    defaultSelected: false,
    iconBg: '#FAECE7',
    iconColor: '#993C1D',
  },
  {
    id: 'track_group_expenses',
    label: 'Track group expenses',
    defaultSelected: false,
    iconBg: '#E6F1FB',
    iconColor: '#185FA5',
  },
];

export function initialGoalSelection(): Record<OnboardingGoalId, boolean> {
  const m = {} as Record<OnboardingGoalId, boolean>;
  for (const o of ONBOARDING_GOAL_OPTIONS) {
    m[o.id] = o.defaultSelected;
  }
  return m;
}

export function selectionToGoalArray(selected: Record<OnboardingGoalId, boolean>): string[] {
  return ONBOARDING_GOAL_IDS.filter((id) => selected[id]);
}

/** Anonymous or existing user — needed before onboarding steps that write `users/{uid}`. */
export async function ensureOnboardingAuthUid(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser.uid;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch {
    return null;
  }
}

export async function saveOnboardingGoalsDraftLocally(goals: string[]): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_GOALS_STORAGE_KEY, JSON.stringify(goals));
}

/** True after goals step persisted locally (Continue), used to resume onboarding for anonymous users. */
export async function hasLocalOnboardingGoalsDraft(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_GOALS_STORAGE_KEY);
    return v != null;
  } catch {
    return false;
  }
}

/** Writes `onboardingGoals` to Firestore; ensures an auth uid (anonymous if needed). */
export async function persistOnboardingGoals(goals: string[]): Promise<void> {
  await saveOnboardingGoalsDraftLocally(goals);
  const uid = await ensureOnboardingAuthUid();
  const db = getFirebaseFirestore();
  if (!uid || !db) return;
  await setDoc(doc(db, 'users', uid), { onboardingGoals: goals }, { merge: true });
}
