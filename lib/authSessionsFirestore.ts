import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import type { AuthSessionDeviceType } from './deviceSessionMetadata';

export type AuthSessionEntry = {
  id: string;
  deviceName: string;
  deviceType: AuthSessionDeviceType;
  lastActive: Date | null;
  fcmToken?: string | null;
};

function coerceDeviceType(raw: unknown): AuthSessionDeviceType {
  if (raw === 'tablet' || raw === 'laptop' || raw === 'desktop') return raw;
  return 'phone';
}

export function subscribeAuthSessions(
  uid: string,
  onData: (sessions: AuthSessionEntry[]) => void,
  onError?: () => void
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onData([]);
    return () => {};
  }
  const col = collection(db, 'users', uid, 'sessions');
  return onSnapshot(
    col,
    (snap) => {
      const list: AuthSessionEntry[] = [];
      snap.forEach((d) => {
        const v = d.data();
        const la = v.lastActive;
        let date: Date | null = null;
        if (la && typeof la.toDate === 'function') {
          try {
            date = la.toDate();
          } catch {
            /* ignore */
          }
        }
        list.push({
          id: d.id,
          deviceName: typeof v.deviceName === 'string' ? v.deviceName : 'Device',
          deviceType: coerceDeviceType(v.deviceType),
          lastActive: date,
          fcmToken: typeof v.fcmToken === 'string' ? v.fcmToken : null,
        });
      });
      list.sort((a, b) => {
        const ta = a.lastActive?.getTime() ?? 0;
        const tb = b.lastActive?.getTime() ?? 0;
        return tb - ta;
      });
      onData(list);
    },
    () => onError?.()
  );
}

export async function upsertCurrentAuthSession(
  uid: string,
  sessionId: string,
  opts: { deviceName: string; deviceType: AuthSessionDeviceType; fcmToken?: string | null }
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid, 'sessions', sessionId),
    {
      deviceName: opts.deviceName,
      deviceType: opts.deviceType,
      lastActive: serverTimestamp(),
      fcmToken: opts.fcmToken ?? null,
    },
    { merge: true }
  );
}

export async function deleteAuthSessionDoc(uid: string, sessionId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId));
}
