import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { subscribeAuthAndProfile, type UserProfileDoc } from '../lib/profile';
import { viewerFirstName } from '../lib/profile/viewerMemberName';

/**
 * Live first name for the signed-in user (Firestore profile + Auth fallbacks).
 */
export function useViewerFirstName(): { firstName: string; profileLoading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    return subscribeAuthAndProfile((s) => {
      setUser(s.user);
      setProfile(s.profile);
      setProfileLoading(s.profileLoading);
    });
  }, []);

  return {
    firstName: viewerFirstName(profile, user),
    profileLoading,
  };
}
