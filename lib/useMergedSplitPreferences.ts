import { useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from './firebase';
import { subscribeAuthAndProfile, type UserProfileDoc } from './profile';
import { mergeSplitPreferences, type SplitPreferences } from './splitPreferences';

/**
 * Live merged split prefs from the signed-in user’s Firestore profile.
 * Falls back to defaults when Firebase is off or while loading.
 */
export function useMergedSplitPreferences(): SplitPreferences {
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setProfile(null);
      return;
    }
    return subscribeAuthAndProfile((s) => {
      setProfile(s.profile);
    });
  }, []);

  return useMemo(() => mergeSplitPreferences(profile?.splitPreferences), [profile]);
}
