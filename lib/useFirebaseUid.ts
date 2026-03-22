import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

export function useFirebaseUid(): string | null {
  const [uid, setUid] = useState<string | null>(() => getFirebaseAuth()?.currentUser?.uid ?? null);
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUid(null);
      return;
    }
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);
  return uid;
}
