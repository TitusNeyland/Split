import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../firebase';
import { mergeNotificationPreferences, type NotificationPreferences } from './notificationPreferences';

/** Merges into `users/{uid}.notificationPreferences` without dropping existing keys. */
export async function saveNotificationPermissionEnabled(enabled: boolean): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth?.currentUser || !db) return;

  const ref = doc(db, 'users', auth.currentUser.uid);
  const snap = await getDoc(ref);
  const prev = snap.exists()
    ? (snap.data().notificationPreferences as Partial<NotificationPreferences> | undefined)
    : undefined;
  const merged = mergeNotificationPreferences({ ...prev, notificationsEnabled: enabled });

  await setDoc(
    ref,
    {
      notificationPreferences: merged,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
