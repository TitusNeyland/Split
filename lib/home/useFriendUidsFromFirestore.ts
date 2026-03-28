import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { subscribeFriendships } from '../friends/friendSystemFirestore';
import { getFirebaseFirestore } from '../firebase';

/**
 * Friend uids (excluding current user) from friendships + display names from users/{uid}.
 */
export function useHomeFriendDirectory(
  viewerUid: string | null
): {
  friendUids: string[];
  displayNameByUid: Record<string, string>;
  loading: boolean;
} {
  const [friendUids, setFriendUids] = useState<string[]>([]);
  const [displayNameByUid, setDisplayNameByUid] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewerUid) {
      setFriendUids([]);
      setDisplayNameByUid({});
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeFriendships(
      viewerUid,
      (docs) => {
        const others = docs
          .map((d) => {
            const u = d.data().users;
            return u[0] === viewerUid ? u[1] : u[0];
          })
          .filter((x): x is string => Boolean(x));
        const uniq = [...new Set(others)];
        setFriendUids(uniq);
        setLoading(false);
      },
      () => {
        setFriendUids([]);
        setLoading(false);
      }
    );
  }, [viewerUid]);

  useEffect(() => {
    if (!viewerUid || friendUids.length === 0) {
      setDisplayNameByUid({});
      setLoading(false);
      return;
    }
    const db = getFirebaseFirestore();
    if (!db) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        friendUids.map(async (fid) => {
          try {
            const snap = await getDoc(doc(db, 'users', fid));
            const dn = snap.exists()
              ? (snap.data() as { displayName?: string | null }).displayName
              : null;
            map[fid] = typeof dn === 'string' && dn.trim() ? dn.trim() : 'Friend';
          } catch {
            map[fid] = 'Friend';
          }
        })
      );
      if (!cancelled) {
        setDisplayNameByUid(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerUid, friendUids.join('|')]);

  return { friendUids, displayNameByUid, loading };
}
