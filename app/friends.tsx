import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import {
  createDirectFriendshipFromSearch,
  fetchOutgoingPendingInviteEmails,
  subscribeFriendships,
} from '../lib/friendSystemFirestore';
import { searchUsersForFriendConnect, type FriendSearchUserRow } from '../lib/userSearchFirestore';
import { initialsFromName } from '../lib/profile';
import { getFriendAvatarColors } from '../lib/friendAvatar';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  purple: '#534AB7',
  green: '#1D9E75',
  sheetBg: '#F2F0EB',
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function SearchResultRow({
  row,
  status,
  busy,
  onConnect,
}: {
  row: FriendSearchUserRow;
  status: 'friend' | 'invited' | 'connect';
  busy: boolean;
  onConnect: () => void;
}) {
  const initials = initialsFromName(row.displayName);
  const colors = getFriendAvatarColors(row.uid);

  return (
    <View style={styles.resultRow}>
      {row.avatarUrl ? (
        <View style={styles.resultAv}>
          <Image source={{ uri: row.avatarUrl }} style={styles.resultAvImg} accessibilityLabel="" />
        </View>
      ) : (
        <View style={[styles.resultAv, { backgroundColor: colors.backgroundColor }]}>
          <Text style={[styles.resultAvTxt, { color: colors.color }]} numberOfLines={1}>
            {initials}
          </Text>
        </View>
      )}
      <View style={styles.resultMid}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {row.displayName}
        </Text>
        <Text style={styles.resultSub} numberOfLines={1}>
          {row.maskedEmail}
        </Text>
      </View>
      {status === 'friend' ? (
        <View style={styles.friendsPill}>
          <Ionicons name="checkmark-circle" size={14} color={C.green} />
          <Text style={styles.friendsPillTxt}>Friends</Text>
        </View>
      ) : null}
      {status === 'invited' ? <Text style={styles.invitedLbl}>Invited</Text> : null}
      {status === 'connect' ? (
        <Pressable
          onPress={onConnect}
          disabled={busy}
          style={({ pressed }) => [
            styles.connectBtn,
            pressed && styles.connectBtnPressed,
            busy && styles.connectBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Connect with ${row.displayName}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.connectBtnTxt}>Connect</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [results, setResults] = useState<FriendSearchUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendUids, setFriendUids] = useState<Set<string>>(() => new Set());
  const [pendingInviteEmails, setPendingInviteEmails] = useState<Set<string>>(() => new Set());
  const [connectingUid, setConnectingUid] = useState<string | null>(null);

  const searchReq = useRef(0);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthReady(true);
      setUser(null);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthReady(true);
      setUser(null);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setFriendUids(new Set());
      return;
    }
    const unsub = subscribeFriendships(
      uid,
      (docs) => {
        const next = new Set<string>();
        for (const d of docs) {
          const { users } = d.data();
          for (const x of users) {
            if (x !== uid) next.add(x);
          }
        }
        setFriendUids(next);
      },
      () => {}
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid || debouncedSearch.trim().length < 3) {
      setPendingInviteEmails(new Set());
      return;
    }
    let cancelled = false;
    void fetchOutgoingPendingInviteEmails(uid).then((set) => {
      if (!cancelled) setPendingInviteEmails(set);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, debouncedSearch]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 3 || !uid) {
      setResults([]);
      setSearching(false);
      return;
    }

    const id = ++searchReq.current;
    setSearching(true);

    void searchUsersForFriendConnect({ currentUid: uid, searchText: q })
      .then((rows) => {
        if (searchReq.current !== id) return;
        setResults(rows);
      })
      .catch(() => {
        if (searchReq.current !== id) return;
        setResults([]);
      })
      .finally(() => {
        if (searchReq.current !== id) return;
        setSearching(false);
      });
  }, [debouncedSearch, uid]);

  const onConnect = useCallback(
    async (row: FriendSearchUserRow) => {
      if (!uid) return;
      if (!isFirebaseConfigured()) {
        Alert.alert('Not available', 'Configure Firebase to connect with other users.');
        return;
      }
      setConnectingUid(row.uid);
      try {
        await createDirectFriendshipFromSearch({ currentUid: uid, otherUid: row.uid });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not connect. Try again.';
        Alert.alert('Could not connect', msg);
      } finally {
        setConnectingUid(null);
      }
    },
    [uid]
  );

  const showEmpty =
    authReady &&
    uid &&
    debouncedSearch.trim().length >= 3 &&
    !searching &&
    results.length === 0;

  const firebaseOff = !isFirebaseConfigured();
  const needsSignIn = isFirebaseConfigured() && authReady && !user;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#6B3FA0', '#4A1570', '#2D0D45']}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4 }]}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroSide}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backRow}
              accessibilityRole="button"
              accessibilityLabel="Back to Profile"
            >
              <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.65)" />
              <Text style={styles.backLbl}>Profile</Text>
            </Pressable>
          </View>
          <Text style={styles.heroTitle}>Friends</Text>
          <View style={[styles.heroSide, styles.heroSideRight]}>
            <Pressable
              onPress={() => router.push('/invite-share')}
              style={styles.invitePill}
              accessibilityRole="button"
              accessibilityLabel="Invite a friend"
            >
              <Text style={styles.invitePillTxt}>+ Invite</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={C.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends or find new…"
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search by name or email"
          />
          {searching ? <ActivityIndicator size="small" color={C.purple} /> : null}
        </View>

        {firebaseOff ? (
          <Text style={styles.hint}>
            User search becomes available once Firebase is configured on this build.
          </Text>
        ) : null}

        {needsSignIn ? (
          <Text style={styles.hint}>Sign in to search for people on mySplit.</Text>
        ) : null}

        {results.map((row) => {
          const isFriend = friendUids.has(row.uid);
          const invited =
            !isFriend &&
            row.emailNormalized != null &&
            pendingInviteEmails.has(row.emailNormalized);
          const status: 'friend' | 'invited' | 'connect' = isFriend
            ? 'friend'
            : invited
              ? 'invited'
              : 'connect';
          return (
            <SearchResultRow
              key={row.uid}
              row={row}
              status={status}
              busy={connectingUid === row.uid}
              onConnect={() => void onConnect(row)}
            />
          );
        })}

        {showEmpty ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>
              No users found · Try inviting them by link instead
            </Text>
            <Pressable
              onPress={() => router.push('/invite-share')}
              style={({ pressed }) => [styles.emptyInviteBtn, pressed && styles.emptyInviteBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Invite by link"
            >
              <Text style={styles.emptyInviteBtnTxt}>Invite by link</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.sheetBg,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroSide: {
    flex: 1,
    minWidth: 0,
  },
  heroSideRight: {
    alignItems: 'flex-end',
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
    textAlign: 'center',
    flexShrink: 0,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backLbl: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  invitePill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
  },
  invitePillTxt: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  body: {
    flex: 1,
    marginTop: -12,
    paddingHorizontal: 13,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.text,
    paddingVertical: 0,
  },
  hint: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 17,
    marginBottom: 12,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  resultAv: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  resultAvTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  resultMid: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  resultSub: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  connectBtn: {
    backgroundColor: C.purple,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnPressed: {
    opacity: 0.92,
  },
  connectBtnDisabled: {
    opacity: 0.7,
  },
  connectBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  friendsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E1F5EE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  friendsPillTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: C.green,
  },
  invitedLbl: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  emptyBlock: {
    marginTop: 20,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyInviteBtn: {
    marginTop: 14,
    backgroundColor: '#F0EEE9',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
  },
  emptyInviteBtnPressed: {
    opacity: 0.9,
  },
  emptyInviteBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: C.purple,
  },
});
