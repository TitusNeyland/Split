import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured } from '../../../lib/firebase';
import { countActiveSubscriptionsForUser, countFriendshipsForUser } from '../../../lib/friends/friendSystemFirestore';
import { getFriendAvatarColors } from '../../../lib/friends/friendAvatar';
import { initialsFromName } from '../../../lib/profile';
import { UserAvatarCircle } from '../../components/shared/UserAvatarCircle';

const C = {
  bg: '#F2F0EB',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  border: 'rgba(0,0,0,0.06)',
};

export default function FriendProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { friendUid } = useLocalSearchParams<{ friendUid: string }>();
  const uid = typeof friendUid === 'string' ? friendUid : '';

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [subsCount, setSubsCount] = useState<number | null>(null);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebaseFirestore();
        if (!db) return;
        const snap = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;
        const d = snap.data();
        const dn =
          typeof d?.displayName === 'string' && d.displayName.trim() ? d.displayName.trim() : 'Friend';
        setDisplayName(dn);
        setAvatarUrl(typeof d?.avatarUrl === 'string' ? d.avatarUrl : null);
        const em = typeof d?.emailNormalized === 'string' ? d.emailNormalized : '';
        if (em) {
          const at = em.indexOf('@');
          const local = at > 0 ? em.slice(0, at).replace(/\./g, '_') : '';
          setUsername(local ? `@${local}` : null);
        } else {
          setUsername(null);
        }
        const [sc, fc] = await Promise.all([
          countActiveSubscriptionsForUser(uid),
          countFriendshipsForUser(uid),
        ]);
        if (!cancelled) {
          setSubsCount(sc);
          setFriendsCount(fc);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const initials = initialsFromName(displayName ?? '');
  const colors = getFriendAvatarColors(uid);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={C.purple} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={C.purple} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            {avatarUrl ? (
              <UserAvatarCircle size={88} initials={initials} imageUrl={avatarUrl} />
            ) : (
              <View style={[styles.fallbackAv, { backgroundColor: colors.backgroundColor }]}>
                <Text style={[styles.fallbackTxt, { color: colors.color }]}>{initials}</Text>
              </View>
            )}
            <Text style={styles.name}>{displayName ?? 'Friend'}</Text>
            {username ? <Text style={styles.handle}>{username}</Text> : null}
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{subsCount != null ? subsCount : '—'}</Text>
              <Text style={styles.statLbl}>Active splits</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{friendsCount != null ? friendsCount : '—'}</Text>
              <Text style={styles.statLbl}>Friends</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.text },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 32 },
  hero: { alignItems: 'center', marginTop: 12 },
  fallbackAv: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackTxt: { fontSize: 28, fontWeight: '700' },
  name: { marginTop: 14, fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  handle: { marginTop: 6, fontSize: 15, color: C.muted, fontWeight: '500' },
  stats: {
    marginTop: 28,
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statVal: { fontSize: 22, fontWeight: '700', color: C.text },
  statLbl: { marginTop: 4, fontSize: 13, color: C.muted },
});
