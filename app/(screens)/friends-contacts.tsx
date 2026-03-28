import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import {
  countActiveSubscriptionsForUser,
  countFriendshipsForUser,
  createDirectFriendshipFromSearch,
  createPendingInvite,
} from '../../lib/friends/friendSystemFirestore';
import { findUsersByPhoneHashCallable, type PhoneHashMatch } from '../../lib/friends/findUsersByPhoneHashCallable';
import { sha256HexUtf8Js } from '../../lib/friends/phoneHashClient';
import { normalizePhoneToE164 } from '../../lib/friends/phoneNormalize';
import { getFriendAvatarColors } from '../../lib/friends/friendAvatar';
import { initialsFromName } from '../../lib/profile';
import { useHomeFriendDirectory } from '../../lib/home/useFriendUidsFromFirestore';
import { buildInviteShareMessage } from '../../lib/friends/inviteLinks';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  green: '#0F6E56',
  greenTint: '#E1F5EE',
  sheetBg: '#F2F0EB',
  divider: '#F0EEE9',
};

const MAX_HASHES = 2000;

type Phase = 'intro' | 'scanning' | 'results';

type ParsedContact = {
  id: string;
  name: string;
  hashes: string[];
};

function openAppSettings() {
  void Linking.openSettings();
}

export default function FriendsContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(() => getFirebaseAuth()?.currentUser ?? null);
  const uid = user?.uid ?? null;
  const { friendUids: friendUidList } = useHomeFriendDirectory(uid);
  const friendUids = useMemo(() => new Set(friendUidList), [friendUidList]);

  const [phase, setPhase] = useState<Phase>('intro');
  const [matches, setMatches] = useState<PhoneHashMatch[]>([]);
  const [unmatchedContacts, setUnmatchedContacts] = useState<ParsedContact[]>([]);
  const [connectingUid, setConnectingUid] = useState<string | null>(null);
  const [connectAllBusy, setConnectAllBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  const runContactSync = useCallback(async () => {
    if (!isFirebaseConfigured() || !user?.uid) {
      Alert.alert('Sign in required', 'Sign in to find friends on mySplit.');
      return;
    }

    setPhase('scanning');
    setMatches([]);
    setUnmatchedContacts([]);

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const hashToName: Record<string, string> = {};
      const contactsParsed: ParsedContact[] = [];

      outer: for (const c of data) {
        const name =
          [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
          (typeof c.name === 'string' ? c.name : '') ||
          'Contact';
        const hashesSet = new Set<string>();
        const phones = c.phoneNumbers ?? [];
        for (const p of phones) {
          if (Object.keys(hashToName).length >= MAX_HASHES) break outer;
          const raw = typeof p.number === 'string' ? p.number : '';
          const e164 = normalizePhoneToE164(raw);
          if (!e164) continue;
          const h = sha256HexUtf8Js(e164).toLowerCase();
          hashesSet.add(h);
          if (!hashToName[h]) hashToName[h] = name;
        }
        if (hashesSet.size > 0) {
          const hashes = [...hashesSet];
          contactsParsed.push({
            id: String(c.id ?? `${name}-${hashes[0]}`),
            name,
            hashes,
          });
        }
      }

      const uniqueHashes = [...new Set(Object.keys(hashToName))];
      if (uniqueHashes.length === 0) {
        Alert.alert('No phone numbers', 'None of your contacts had phone numbers we could read.');
        setPhase('intro');
        return;
      }

      const found = await findUsersByPhoneHashCallable(uniqueHashes);
      setMatches(found);

      const matchedHashes = new Set(found.map((m) => m.requestHash.toLowerCase()));
      const unmatched: ParsedContact[] = [];
      for (const pc of contactsParsed) {
        const anyMatched = pc.hashes.some((h) => matchedHashes.has(h.toLowerCase()));
        if (!anyMatched) unmatched.push(pc);
      }
      setUnmatchedContacts(unmatched);
      setPhase('results');
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : 'Try again later.');
      setPhase('intro');
    }
  }, [user?.uid]);

  const onAllowAccess = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Contacts access',
        Platform.OS === 'ios'
          ? 'To find friends from your phone book, open Settings → Split → Contacts and turn on access.'
          : 'To find friends from your phone book, open Settings → Apps → Split → Permissions and allow Contacts.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]
      );
      return;
    }
    await runContactSync();
  }, [runContactSync]);

  const onConnect = useCallback(
    async (row: PhoneHashMatch) => {
      if (!user?.uid) return;
      setConnectingUid(row.uid);
      try {
        const outcome = await createDirectFriendshipFromSearch({
          currentUid: user.uid,
          otherUid: row.uid,
          connectedVia: 'contacts',
        });
        if (outcome === 'created') {
          Alert.alert('Connected', `You and ${row.displayName} are now friends.`);
        }
        setMatches((prev) => prev.filter((m) => m.uid !== row.uid));
      } catch (e) {
        Alert.alert('Could not connect', e instanceof Error ? e.message : 'Try again.');
      } finally {
        setConnectingUid(null);
      }
    },
    [user?.uid]
  );

  const onConnectAll = useCallback(async () => {
    if (!user?.uid) return;
    const seen = new Set<string>();
    const toConnect: PhoneHashMatch[] = [];
    for (const m of matches) {
      if (seen.has(m.uid)) continue;
      seen.add(m.uid);
      if (!friendUids.has(m.uid)) toConnect.push(m);
    }
    if (toConnect.length === 0) return;
    const uids = new Set(toConnect.map((m) => m.uid));
    setConnectAllBusy(true);
    try {
      for (const m of toConnect) {
        await createDirectFriendshipFromSearch({
          currentUid: user.uid,
          otherUid: m.uid,
          connectedVia: 'contacts',
        });
      }
      setMatches((prev) => prev.filter((m) => !uids.has(m.uid)));
      Alert.alert('Connected', `You’re now connected with ${toConnect.length} people.`);
    } catch (e) {
      Alert.alert('Could not connect', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setConnectAllBusy(false);
    }
  }, [user?.uid, matches, friendUids]);

  const onInviteOne = useCallback(async () => {
    if (!user?.uid) return;
    setInviteBusy(true);
    try {
      const [splits, friends] = await Promise.all([
        countActiveSubscriptionsForUser(user.uid),
        countFriendshipsForUser(user.uid),
      ]);
      const inviteId = await createPendingInvite({
        creatorUid: user.uid,
        connectedVia: 'direct_invite',
        senderActiveSplits: splits,
        senderFriendCount: friends,
      });
      await Share.share({ message: buildInviteShareMessage(inviteId) });
    } catch (e) {
      Alert.alert('Could not share invite', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setInviteBusy(false);
    }
  }, [user?.uid]);

  const onInviteAll = useCallback(async () => {
    await onInviteOne();
  }, [onInviteOne]);

  const dedupedMatches = useMemo(() => {
    const seen = new Set<string>();
    let out: PhoneHashMatch[] = [];
    for (const m of matches) {
      if (seen.has(m.uid)) continue;
      seen.add(m.uid);
      out.push(m);
    }
    return out;
  }, [matches]);

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
        <Pressable
          onPress={() => router.back()}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back to Friends"
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.65)" />
          <Text style={styles.backLbl}>Friends</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Find from contacts</Text>
      </LinearGradient>

      {phase === 'scanning' ? (
        <View style={styles.scanningWrap}>
          <ActivityIndicator size="large" color={C.purple} />
          <Text style={styles.scanningTxt}>Checking contacts…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: phase === 'results' ? 12 : 20,
            paddingBottom: insets.bottom + 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          {phase === 'intro' ? (
            <>
              <View style={styles.permIcon}>
                <Ionicons name="people" size={32} color={C.purple} />
              </View>
              <Text style={styles.headline}>Find your people</Text>
              <Text style={styles.bodyTxt}>
                We&apos;ll check which of your contacts are already on mySplit.
              </Text>

              <View style={styles.bullets}>
                <Bullet text="Phone numbers are hashed before leaving your device" />
                <Bullet text="Your contacts are never stored on our servers" />
                <Bullet text="Non-mySplit contacts are immediately discarded" />
              </View>
            </>
          ) : null}

          {phase === 'results' ? (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.resultsSectionTitle}>Already on mySplit</Text>
                {dedupedMatches.filter((m) => !friendUids.has(m.uid)).length > 1 ? (
                  <Pressable
                    onPress={() => void onConnectAll()}
                    disabled={connectAllBusy}
                    style={styles.sectionAction}
                  >
                    <Text style={styles.sectionActionTxt}>
                      {connectAllBusy ? '…' : 'Connect all'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {dedupedMatches.length === 0 ? (
                <Text style={styles.resultsEmpty}>
                  No one from your contacts is on mySplit yet. Invite them below.
                </Text>
              ) : (
                dedupedMatches.map((m) => {
                  const av = getFriendAvatarColors(m.uid);
                  const ini = initialsFromName(m.displayName);
                  const friend = friendUids.has(m.uid);
                  return (
                    <View key={m.uid} style={styles.matchRow}>
                      {m.avatarUrl ? (
                        <Image source={{ uri: m.avatarUrl }} style={styles.matchAv} />
                      ) : (
                        <View style={[styles.matchAv, { backgroundColor: av.backgroundColor }]}>
                          <Text style={[styles.matchAvTxt, { color: av.color }]}>{ini}</Text>
                        </View>
                      )}
                      <View style={styles.matchMid}>
                        <Text style={styles.matchName} numberOfLines={1}>
                          {m.displayName}
                        </Text>
                        <Text style={styles.matchSub} numberOfLines={1}>
                          {m.username} · In your contacts
                        </Text>
                      </View>
                      {friend ? (
                        <View style={styles.friendsPill}>
                          <Text style={styles.friendsPillTxt}>Friends ✓</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => void onConnect(m)}
                          disabled={connectingUid === m.uid}
                          style={({ pressed }) => [
                            styles.connectBtn,
                            pressed && styles.connectBtnPressed,
                            connectingUid === m.uid && styles.connectBtnDisabled,
                          ]}
                        >
                          {connectingUid === m.uid ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.connectBtnTxt}>Connect</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  );
                })
              )}

              <View style={[styles.sectionHeaderRow, styles.sectionSpaced]}>
                <Text style={styles.resultsSectionTitle}>Not on mySplit yet</Text>
                {unmatchedContacts.length > 1 ? (
                  <Pressable
                    onPress={() => void onInviteAll()}
                    disabled={inviteBusy}
                    style={styles.sectionAction}
                  >
                    <Text style={styles.sectionActionTxt}>{inviteBusy ? '…' : 'Invite all'}</Text>
                  </Pressable>
                ) : null}
              </View>
              {unmatchedContacts.length === 0 ? (
                <Text style={styles.resultsEmpty}>Everyone with a phone number is already here.</Text>
              ) : (
                unmatchedContacts.map((c) => {
                  const ini = initialsFromName(c.name);
                  return (
                    <View key={c.id} style={styles.matchRow}>
                      <View style={[styles.matchAv, { backgroundColor: '#E8E6E1' }]}>
                        <Text style={[styles.matchAvTxt, { color: C.muted }]}>{ini}</Text>
                      </View>
                      <View style={styles.matchMid}>
                        <Text style={styles.matchName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.matchSub} numberOfLines={1}>
                          In your contacts
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => void onInviteOne()}
                        disabled={inviteBusy}
                        style={({ pressed }) => [styles.inviteBtn, pressed && styles.inviteBtnPressed]}
                      >
                        <Text style={styles.inviteBtnTxt}>Invite</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}

              <Pressable
                onPress={() => void runContactSync()}
                style={({ pressed }) => [styles.secondarySync, pressed && styles.secondarySyncPressed]}
              >
                <Ionicons name="refresh-outline" size={18} color={C.purple} />
                <Text style={styles.secondarySyncTxt}>Sync contacts again</Text>
              </Pressable>
            </>
          ) : null}

          {phase === 'intro' ? (
            <>
              <Pressable
                onPress={() => void onAllowAccess()}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Allow access to contacts"
              >
                <Text style={styles.primaryBtnTxt}>Allow access to contacts</Text>
              </Pressable>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryBtnTxt}>Not now</Text>
              </Pressable>
            </>
          ) : null}

          {phase === 'results' ? (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed, styles.doneBtn]}
            >
              <Text style={styles.secondaryBtnTxt}>Done</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={bulletStyles.row}>
      <View style={bulletStyles.ico}>
        <Ionicons name="checkmark" size={14} color={C.green} />
      </View>
      <Text style={bulletStyles.txt}>{text}</Text>
    </View>
  );
}

const bulletStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  ico: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: C.text,
    lineHeight: 19,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.sheetBg,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backLbl: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
    backgroundColor: C.sheetBg,
  },
  scanningWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  scanningTxt: {
    fontSize: 15,
    color: C.muted,
  },
  permIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headline: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  bodyTxt: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  bullets: {
    backgroundColor: '#F8F7F4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionSpaced: {
    marginTop: 22,
  },
  resultsSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionAction: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sectionActionTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.purple,
  },
  resultsEmpty: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 20,
    marginBottom: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  matchAv: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  matchAvTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
  matchMid: { flex: 1, minWidth: 0 },
  matchName: { fontSize: 15, fontWeight: '600', color: C.text },
  matchSub: { fontSize: 12, color: C.muted, marginTop: 3 },
  friendsPill: {
    backgroundColor: C.greenTint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  friendsPillTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: C.green,
  },
  connectBtn: {
    backgroundColor: C.purple,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  connectBtnPressed: { opacity: 0.92 },
  connectBtnDisabled: { opacity: 0.7 },
  connectBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
  inviteBtn: {
    borderWidth: 1,
    borderColor: C.purple,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  inviteBtnPressed: { opacity: 0.88 },
  inviteBtnTxt: { color: C.purple, fontWeight: '600', fontSize: 13 },
  secondarySync: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
  },
  secondarySyncPressed: { opacity: 0.75 },
  secondarySyncTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: C.purple,
  },
  primaryBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D3D1C7',
  },
  secondaryBtnPressed: {
    opacity: 0.88,
  },
  secondaryBtnTxt: {
    fontSize: 14,
    color: C.muted,
  },
  doneBtn: {
    marginTop: 8,
  },
});
