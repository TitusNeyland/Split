import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Toast } from '../../../components/shared/Toast';
import { UserAvatarCircle } from '../../../components/shared/UserAvatarCircle';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import {
  countActiveSubscriptionsForUser,
  countFriendshipsForUser,
  createDirectFriendshipFromSearch,
  createPendingInvite,
  deleteFriendshipBetween,
  expirePendingInvite,
  fetchInviteById,
  fetchOutgoingPendingInvites,
  fetchOutgoingPendingInviteEmails,
  type OutgoingPendingInviteSummary,
} from '../../../lib/friends/friendSystemFirestore';
import { searchUsersForFriendConnect, type FriendSearchUserRow } from '../../../lib/friends/userSearchFirestore';
import { initialsFromName, buildFriendsHubFriendRowsFromSubscriptions, type FriendsHubFriendRow } from '../../../lib/profile';
import { useHomeFriendDirectory } from '../../../lib/home/useFriendUidsFromFirestore';
import { useSubscriptions } from '../../../contexts/SubscriptionsContext';
import { getFriendAvatarColors } from '../../../lib/friends/friendAvatar';
import { formatInviteExpiresIn, formatInviteSentAgo } from '../../../lib/friends/friendsTimeFormat';
import FriendsInviteModal from '../../../components/invite/FriendsInviteModal';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  purple: '#534AB7',
  green: '#1D9E75',
  red: '#E24B4A',
  amber: '#EF9F27',
  sheetBg: '#F2F0EB',
  divider: '#F5F3EE',
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function SectionHeader({ title, rightAction }: { title: string; rightAction?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {rightAction}
    </View>
  );
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
  const colors = getFriendAvatarColors(row.uid);

  return (
    <View style={styles.resultRow}>
      <UserAvatarCircle
        size={40}
        uid={row.uid}
        initials={initialsFromName(row.displayName)}
        imageUrl={row.avatarUrl}
        initialsBackgroundColor={colors.backgroundColor}
        initialsTextColor={colors.color}
      />
      <View style={styles.resultMid}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {row.displayName}
        </Text>
        <Text style={styles.resultSub} numberOfLines={1}>
          {row.usernameHandle} · on mySplit
        </Text>
      </View>
      {status === 'friend' ? (
        <View style={styles.friendsPill}>
          <Text style={styles.friendsPillTxt}>Friends ✓</Text>
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
            <ActivityIndicator size="small" color={C.purple} />
          ) : (
            <Ionicons name="person-add" size={18} color={C.purple} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function balanceColor(tone: FriendsHubFriendRow['balanceTone']): string {
  if (tone === 'green') return C.green;
  if (tone === 'red') return C.red;
  if (tone === 'amber') return C.amber;
  return C.muted;
}

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<TextInput>(null);

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [results, setResults] = useState<FriendSearchUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingInviteEmails, setPendingInviteEmails] = useState<Set<string>>(() => new Set());
  const [fetchedPending, setFetchedPending] = useState<OutgoingPendingInviteSummary[]>([]);
  const [pendingRefresh, setPendingRefresh] = useState(0);
  const [connectingUid, setConnectingUid] = useState<string | null>(null);
  const [connectToast, setConnectToast] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [prefilledInviteId, setPrefilledInviteId] = useState<string | null>(null);

  const searchReq = useRef(0);

  const uid = user?.uid ?? null;
  const { subscriptions } = useSubscriptions();
  const { friendUids: friendUidList, displayNameByUid } = useHomeFriendDirectory(uid);
  const friendUids = useMemo(() => new Set(friendUidList), [friendUidList]);

  const hubFriends = useMemo((): FriendsHubFriendRow[] => {
    if (!uid || !isFirebaseConfigured()) return [];
    return buildFriendsHubFriendRowsFromSubscriptions(uid, subscriptions, friendUidList, displayNameByUid);
  }, [uid, subscriptions, friendUidList, displayNameByUid]);

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

  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setFetchedPending([]);
      return;
    }
    let cancelled = false;
    void fetchOutgoingPendingInvites(uid).then((rows) => {
      if (!cancelled) setFetchedPending(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, pendingRefresh]);

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

  const pendingRows = useMemo(() => fetchedPending, [fetchedPending]);

  const qLower = searchQuery.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!qLower) return hubFriends;
    return hubFriends.filter((f) => f.displayName.toLowerCase().includes(qLower));
  }, [hubFriends, qLower]);

  const openInvite = useCallback(() => {
    setPrefilledInviteId(null);
    setInviteModalOpen(true);
  }, []);
  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  const showConnectToast = useCallback((message: string) => {
    setConnectToast(message);
  }, []);

  const onConnect = useCallback(
    async (row: FriendSearchUserRow) => {
      if (!uid) return;
      if (!isFirebaseConfigured()) {
        Alert.alert('Not available', 'Configure Firebase to connect with other users.');
        return;
      }
      setConnectingUid(row.uid);
      try {
        const outcome = await createDirectFriendshipFromSearch({ currentUid: uid, otherUid: row.uid });
        if (outcome === 'created') {
          showConnectToast(`You're now connected with ${row.displayName}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not connect. Try again.';
        Alert.alert('Could not connect', msg);
      } finally {
        setConnectingUid(null);
      }
    },
    [uid, showConnectToast]
  );

  const confirmRemoveFriend = useCallback(
    (row: FriendsHubFriendRow) => {
      Alert.alert(
        'Remove friend?',
        `${row.displayName} will be removed from your friends list.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              if (uid && row.remoteUid && isFirebaseConfigured()) {
                void deleteFriendshipBetween(uid, row.remoteUid).catch(() => {
                  Alert.alert('Could not remove', 'Check your connection and try again.');
                });
              }
            },
          },
        ]
      );
    },
    [uid]
  );

  const onCancelPending = useCallback(
    async (row: OutgoingPendingInviteSummary) => {
      if (!isFirebaseConfigured() || !uid) return;
      try {
        await expirePendingInvite(row.inviteId);
        setPendingRefresh((n) => n + 1);
      } catch {
        Alert.alert('Could not cancel', 'Check your connection and try again.');
      }
    },
    [uid]
  );

  const onResendPending = useCallback(
    async (row: OutgoingPendingInviteSummary) => {
      if (!uid || !isFirebaseConfigured()) return;
      try {
        const inv = await fetchInviteById(row.inviteId);
        if (!inv) {
          Alert.alert('Could not resend', 'Invite not found.');
          return;
        }
        await expirePendingInvite(row.inviteId);
        const [splits, friends] = await Promise.all([
          countActiveSubscriptionsForUser(uid),
          countFriendshipsForUser(uid),
        ]);
        const newId = await createPendingInvite({
          creatorUid: uid,
          connectedVia: inv.connectedVia ?? 'direct_invite',
          recipientEmailRaw:
            typeof inv.recipientEmail === 'string' && inv.recipientEmail.length > 0
              ? inv.recipientEmail
              : undefined,
          senderActiveSplits: splits,
          senderFriendCount: friends,
        });
        setPrefilledInviteId(newId);
        setInviteModalOpen(true);
        setPendingRefresh((n) => n + 1);
      } catch (e) {
        Alert.alert('Could not resend', e instanceof Error ? e.message : 'Try again.');
      }
    },
    [uid]
  );

  const showDiscoveryEmpty =
    authReady &&
    uid &&
    debouncedSearch.trim().length >= 3 &&
    !searching &&
    results.length === 0;

  const hasFriends = hubFriends.length > 0;
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
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4, paddingBottom: 20 }]}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroSide}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backRow}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.65)" />
            </Pressable>
          </View>
          <Text style={styles.heroTitle}>Friends</Text>
          <View style={[styles.heroSide, styles.heroSideRight]}>
            <Pressable
              onPress={openInvite}
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
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.searchWrap,
            searchQuery.trim().length >= 3 && styles.searchWrapActive,
          ]}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={searchQuery.trim().length >= 3 ? C.purple : C.muted}
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search friends or find new…"
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search friends or find new people"
          />
          {searching ? <ActivityIndicator size="small" color={C.purple} /> : null}
        </View>

        {firebaseOff ? (
          <Text style={styles.hint}>
            Sign in and configure Firebase to sync friends, invites, and discovery.
          </Text>
        ) : null}
        {needsSignIn ? <Text style={styles.hint}>Sign in to manage friends and invites.</Text> : null}

        {hasFriends ? (
          <>
            <SectionHeader title={`My friends (${hubFriends.length})`} />
            <View style={styles.card}>
              {filteredFriends.length === 0 ? (
                <View style={styles.filterEmpty}>
                  <Text style={styles.filterEmptyTxt}>No friends match your search.</Text>
                </View>
              ) : (
                filteredFriends.map((row, index) => (
                  <View key={row.id}>
                    {index > 0 ? <View style={styles.cardDivider} /> : null}
                    <Swipeable
                      overshootRight={false}
                      renderRightActions={() => (
                        <View style={styles.swipeRight}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.swipeRemoveBtn,
                              pressed && styles.swipeRemoveBtnPressed,
                            ]}
                            onPress={() => confirmRemoveFriend(row)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${row.displayName}`}
                          >
                            <Text style={styles.swipeRemoveTxt}>Remove</Text>
                          </Pressable>
                        </View>
                      )}
                    >
                      <Pressable
                        onPress={() =>
                          router.push({ pathname: '/activity', params: { friendId: row.id } })
                        }
                        style={({ pressed }) => [styles.friendRow, pressed && styles.friendRowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`${row.displayName}, ${row.balanceMain}`}
                      >
                        <UserAvatarCircle
                          size={36}
                          uid={row.id}
                          initials={row.initials}
                          initialsBackgroundColor={getFriendAvatarColors(row.id).backgroundColor}
                          initialsTextColor={getFriendAvatarColors(row.id).color}
                          style={{ marginRight: 10 }}
                        />
                        <View style={styles.friendMid}>
                          <Text style={styles.friendName} numberOfLines={1}>
                            {row.displayName}
                          </Text>
                          <Text style={styles.friendSub} numberOfLines={1}>
                            {row.sharedSubsLabel}
                          </Text>
                          <Text style={styles.friendMeta} numberOfLines={1}>
                            {row.balanceSub}
                          </Text>
                        </View>
                        <View style={styles.friendRight}>
                          <Text style={[styles.friendAmt, { color: balanceColor(row.balanceTone) }]} numberOfLines={1}>
                            {row.balanceMain}
                          </Text>
                        </View>
                      </Pressable>
                    </Swipeable>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        {!hasFriends && debouncedSearch.trim().length < 3 ? (
          <View style={styles.emptyHero}>
            <View style={styles.emptyIllu}>
              <View style={[styles.emptyPerson, { marginRight: -12, zIndex: 1 }]}>
                <Ionicons name="person" size={28} color={C.purple} />
              </View>
              <View style={[styles.emptyPerson, { backgroundColor: '#E1F5EE' }]}>
                <Ionicons name="person" size={28} color={C.green} />
              </View>
            </View>
            <Text style={styles.emptyHeroTitle}>No friends yet</Text>
            <Text style={styles.emptyHeroSub}>
              Invite someone to split your first subscription together
            </Text>
            <Pressable
              onPress={openInvite}
              style={({ pressed }) => [styles.emptyPrimaryBtn, pressed && styles.emptyPrimaryBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Invite a friend"
            >
              <Text style={styles.emptyPrimaryBtnTxt}>Invite a friend</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/friends-contacts')}
              style={({ pressed }) => [styles.emptySecondaryBtn, pressed && styles.emptySecondaryBtnPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.emptySecondaryBtnTxt}>Find from contacts</Text>
            </Pressable>
          </View>
        ) : null}

        {uid && debouncedSearch.trim().length >= 3 ? (
          <>
            <SectionHeader
              title="Results"
              rightAction={
                !searching ? <Text style={styles.resultsCount}>{results.length} found</Text> : null
              }
            />
            {results.map((r) => {
              const isFriend = friendUids.has(r.uid);
              const invited =
                !isFriend &&
                r.emailNormalized != null &&
                pendingInviteEmails.has(r.emailNormalized);
              const status: 'friend' | 'invited' | 'connect' = isFriend
                ? 'friend'
                : invited
                  ? 'invited'
                  : 'connect';
              return (
                <SearchResultRow
                  key={r.uid}
                  row={r}
                  status={status}
                  busy={connectingUid === r.uid}
                  onConnect={() => void onConnect(r)}
                />
              );
            })}
            {showDiscoveryEmpty ? (
              <View style={styles.discoveryEmpty}>
                <View style={styles.discoveryEmptyIcon}>
                  <Ionicons name="search-outline" size={22} color={C.muted} />
                </View>
                <Text style={styles.discoveryEmptyTxt}>
                  No one found · {debouncedSearch.trim()} isn&apos;t on mySplit yet
                </Text>
                <Pressable
                  onPress={openInvite}
                  style={({ pressed }) => [styles.discoveryInviteBtn, pressed && styles.discoveryInviteBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Invite by link"
                >
                  <Text style={styles.discoveryInviteBtnTxt}>Invite by link →</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {uid ? (
          <>
            <SectionHeader title="Find people" />
            <View style={styles.card}>
              <Pressable
                style={({ pressed }) => [styles.findRow, pressed && styles.findRowPressed]}
                onPress={() => router.push('/friends-contacts')}
              >
                <View style={[styles.findIco, { backgroundColor: '#FAEEDA' }]}>
                  <Ionicons name="people-outline" size={18} color="#854F0B" />
                </View>
                <View style={styles.findMid}>
                  <Text style={styles.findTitle}>From your contacts</Text>
                  <Text style={styles.findSub}>Find friends already on mySplit</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C8C6C0" />
              </Pressable>
              <View style={styles.cardDivider} />
              <Pressable
                style={({ pressed }) => [styles.findRow, pressed && styles.findRowPressed]}
                onPress={focusSearch}
              >
                <View style={[styles.findIco, { backgroundColor: '#EEEDFE' }]}>
                  <Ionicons name="search-outline" size={18} color={C.purple} />
                </View>
                <View style={styles.findMid}>
                  <Text style={styles.findTitle}>Search by name or email</Text>
                  <Text style={styles.findSub}>Find a specific person</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C8C6C0" />
              </Pressable>
              <View style={styles.cardDivider} />
              <Pressable
                style={({ pressed }) => [styles.findRow, pressed && styles.findRowPressed]}
                onPress={openInvite}
              >
                <View style={[styles.findIco, { backgroundColor: '#E1F5EE' }]}>
                  <Ionicons name="share-outline" size={18} color={C.green} />
                </View>
                <View style={styles.findMid}>
                  <Text style={styles.findTitle}>Invite by link</Text>
                  <Text style={styles.findSub}>Share a link via any app</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C8C6C0" />
              </Pressable>
            </View>
          </>
        ) : null}

        {uid && pendingRows.length > 0 ? (
          <>
            <SectionHeader title={`Pending (${pendingRows.length})`} />
            <View style={styles.card}>
              {pendingRows.map((p, i) => (
                <View key={p.inviteId}>
                  {i > 0 ? <View style={styles.cardDivider} /> : null}
                  <View style={styles.pendingRow}>
                    <View style={styles.pendingAv}>
                      <Text style={styles.pendingAvTxt}>?</Text>
                    </View>
                    <View style={styles.pendingMid}>
                      <Text style={styles.pendingTitle} numberOfLines={1}>
                        {p.recipientLabel}
                      </Text>
                      <Text style={styles.pendingSub} numberOfLines={2}>
                        {formatInviteSentAgo(p.createdAt)}
                        {p.expiresAt ? ` · ${formatInviteExpiresIn(p.expiresAt)}` : ''}
                      </Text>
                    </View>
                    <View style={styles.pendingActions}>
                      <Pressable
                        onPress={() => void onResendPending(p)}
                        style={({ pressed }) => [styles.resendBtn, pressed && styles.resendBtnPressed]}
                      >
                        <Text style={styles.resendBtnTxt}>Resend</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void onCancelPending(p)}
                        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
                      >
                        <Text style={styles.cancelBtnTxt}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Toast
        message={connectToast}
        onDismiss={() => setConnectToast(null)}
        duration={3000}
        type="success"
        showIcon
        bottomInsetExtra={20}
      />

      {inviteModalOpen ? (
        <FriendsInviteModal
          visible={inviteModalOpen}
          prefilledInviteId={prefilledInviteId}
          onClose={() => {
            setInviteModalOpen(false);
            setPrefilledInviteId(null);
          }}
        />
      ) : null}
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
    fontSize: 18.5,
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
  invitePill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
  },
  invitePillTxt: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#fff',
  },
  body: {
    flex: 1,
    paddingHorizontal: 13,
    backgroundColor: C.sheetBg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 0,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  searchWrapActive: {
    borderColor: C.purple,
  },
  resultsCount: {
    fontSize: 11.5,
    color: C.muted,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    color: C.text,
    paddingVertical: 0,
  },
  hint: {
    fontSize: 13.5,
    color: C.muted,
    lineHeight: 17,
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 9,
  },
  sectionHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 58,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: '#fff',
  },
  friendRowPressed: {
    opacity: 0.92,
  },
  friendMid: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: 16.5,
    fontWeight: '600',
    color: C.text,
  },
  friendSub: {
    fontSize: 13.5,
    color: C.muted,
    marginTop: 2,
  },
  friendMeta: {
    fontSize: 12.5,
    color: C.muted,
    marginTop: 2,
  },
  friendRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
    maxWidth: '36%',
  },
  friendAmt: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  swipeRight: {
    justifyContent: 'center',
    backgroundColor: '#FCEBEB',
  },
  swipeRemoveBtn: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  swipeRemoveBtnPressed: {
    opacity: 0.85,
  },
  swipeRemoveTxt: {
    fontSize: 14.5,
    fontWeight: '600',
    color: C.red,
  },
  filterEmpty: {
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  filterEmptyTxt: {
    fontSize: 14.5,
    color: C.muted,
    textAlign: 'center',
  },
  findRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  findRowPressed: {
    opacity: 0.9,
  },
  findIco: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findMid: {
    flex: 1,
    minWidth: 0,
  },
  findTitle: {
    fontSize: 15.5,
    fontWeight: '500',
    color: C.text,
  },
  findSub: {
    fontSize: 13.5,
    color: C.muted,
    marginTop: 2,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 13,
    gap: 10,
  },
  pendingAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingAvTxt: {
    fontSize: 15.5,
    fontWeight: '600',
    color: C.muted,
  },
  pendingMid: {
    flex: 1,
    minWidth: 0,
  },
  pendingTitle: {
    fontSize: 15.5,
    fontWeight: '500',
    color: C.text,
  },
  pendingSub: {
    fontSize: 13.5,
    color: C.muted,
    marginTop: 2,
    lineHeight: 15,
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  resendBtn: {
    backgroundColor: '#F0EEE9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resendBtnPressed: {
    opacity: 0.88,
  },
  resendBtnTxt: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#5F5E5A',
  },
  cancelBtn: {
    backgroundColor: '#FCEBEB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelBtnPressed: {
    opacity: 0.88,
  },
  cancelBtnTxt: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.red,
  },
  emptyHero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 16,
  },
  emptyIllu: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  emptyPerson: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.sheetBg,
  },
  emptyHeroTitle: {
    fontSize: 19.5,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptyHeroSub: {
    fontSize: 14.5,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  emptyPrimaryBtn: {
    width: '100%',
    backgroundColor: C.purple,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyPrimaryBtnPressed: {
    opacity: 0.92,
  },
  emptyPrimaryBtnTxt: {
    fontSize: 16.5,
    fontWeight: '600',
    color: '#fff',
  },
  emptySecondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D3D1C7',
  },
  emptySecondaryBtnPressed: {
    opacity: 0.88,
  },
  emptySecondaryBtnTxt: {
    fontSize: 15.5,
    color: C.muted,
    fontWeight: '500',
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
  resultMid: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    color: C.text,
  },
  resultSub: {
    fontSize: 13.5,
    color: C.muted,
    marginTop: 2,
  },
  connectBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnPressed: {
    opacity: 0.92,
  },
  connectBtnDisabled: {
    opacity: 0.7,
  },
  friendsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E1F5EE',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
  },
  friendsPillTxt: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F6E56',
  },
  invitedLbl: {
    fontSize: 13.5,
    fontWeight: '500',
    color: C.muted,
  },
  discoveryEmpty: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  discoveryEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  discoveryEmptyTxt: {
    fontSize: 14.5,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  discoveryInviteBtn: {
    marginTop: 12,
    backgroundColor: '#F0EEE9',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  discoveryInviteBtnPressed: {
    opacity: 0.9,
  },
  discoveryInviteBtnTxt: {
    fontSize: 14.5,
    fontWeight: '600',
    color: C.purple,
  },
});
