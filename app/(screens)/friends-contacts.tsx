import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from '../../lib/firebase';
import {
  createDirectFriendshipFromSearch,
  lookupUsersByPhoneHashes,
  sha256HexUtf8,
  upsertContactPhoneIndexForUser,
  upsertUserContact,
} from '../../lib/friends/friendSystemFirestore';
import { normalizePhoneToE164 } from '../../lib/friends/phoneNormalize';
import { getFriendAvatarColors } from '../../lib/friends/friendAvatar';
import { initialsFromName } from '../../lib/profile';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  green: '#0F6E56',
  sheetBg: '#F2F0EB',
};

type MatchRow = {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
};

const MAX_HASHES = 800;

export default function FriendsContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [doneOnce, setDoneOnce] = useState(false);
  const [connectingUid, setConnectingUid] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  const registerOwnPhoneIndex = useCallback(async (uid: string) => {
    const auth = getFirebaseAuth();
    const u = auth?.currentUser;
    const raw = u?.phoneNumber;
    if (!raw) return;
    const e164 = normalizePhoneToE164(raw) ?? raw;
    const db = getFirebaseFirestore();
    if (!db) return;
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? (snap.data() as { displayName?: string; avatarUrl?: string }) : {};
    const displayName =
      typeof d.displayName === 'string' && d.displayName.trim() ? d.displayName.trim() : 'mySplit user';
    const avatarUrl = typeof d.avatarUrl === 'string' ? d.avatarUrl : null;
    await upsertContactPhoneIndexForUser({ uid, phoneE164: e164, displayName, avatarUrl });
  }, []);

  const onAllow = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'No access',
        'You can enable contacts later in Settings if you change your mind.'
      );
      return;
    }

    if (!isFirebaseConfigured() || !user?.uid) {
      Alert.alert('Sign in required', 'Sign in to find friends on mySplit.');
      return;
    }

    setSyncing(true);
    setMatches([]);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const hashToName = new Map<string, string>();
      for (const c of data) {
        const name =
          [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
          (typeof c.name === 'string' ? c.name : '') ||
          'Contact';
        const phones = c.phoneNumbers ?? [];
        for (const p of phones) {
          const raw = typeof p.number === 'string' ? p.number : '';
          const e164 = normalizePhoneToE164(raw);
          if (!e164) continue;
          const hash = await sha256HexUtf8(e164);
          if (!hashToName.has(hash)) hashToName.set(hash, name);
          if (hashToName.size >= MAX_HASHES) break;
        }
        if (hashToName.size >= MAX_HASHES) break;
      }

      const hashes = [...hashToName.keys()];
      await Promise.all(
        [...hashToName.entries()].map(([h, name]) =>
          upsertUserContact({ uid: user.uid, phoneHash: h, name })
        )
      );

      await registerOwnPhoneIndex(user.uid);

      const found = await lookupUsersByPhoneHashes(hashes, user.uid);
      setMatches(
        found.map((f) => ({
          uid: f.uid,
          displayName: f.displayName,
          avatarUrl: f.avatarUrl,
        }))
      );
      setDoneOnce(true);
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : 'Try again later.');
    } finally {
      setSyncing(false);
    }
  };

  const onConnect = async (row: MatchRow) => {
    if (!user?.uid) return;
    setConnectingUid(row.uid);
    try {
      await createDirectFriendshipFromSearch({ currentUid: user.uid, otherUid: row.uid });
      setMatches((prev) => prev.filter((x) => x.uid !== row.uid));
      Alert.alert('Connected', `You and ${row.displayName} are now friends.`);
    } catch (e) {
      Alert.alert('Could not connect', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setConnectingUid(null);
    }
  };

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

      <ScrollView
        style={styles.body}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.permIcon}>
          <Ionicons name="people-outline" size={32} color={C.purple} />
        </View>
        <Text style={styles.headline}>Find your people</Text>
        <Text style={styles.bodyTxt}>
          We’ll check which of your contacts are already on mySplit. Phone numbers are hashed on
          device; only hashes are stored in your account for matching.
        </Text>

        <View style={styles.bullets}>
          <Bullet text="Phone numbers are hashed before leaving your device" />
          <Bullet text="Contact names are stored with hashes so you can see who matched" />
          <Bullet text="Matches use the phone number registered on mySplit" />
        </View>

        {syncing ? (
          <View style={styles.syncBox}>
            <ActivityIndicator color={C.purple} />
            <Text style={styles.syncTxt}>Syncing contacts…</Text>
          </View>
        ) : null}

        {doneOnce && !syncing ? (
          <View style={styles.resultsBox}>
            <Text style={styles.resultsTitle}>On mySplit</Text>
            {matches.length === 0 ? (
              <Text style={styles.resultsEmpty}>
                No matches yet. Friends need to add the same phone number to mySplit to appear here.
              </Text>
            ) : (
              matches.map((m) => {
                const av = getFriendAvatarColors(m.uid);
                const ini = initialsFromName(m.displayName);
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
                    </View>
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
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        <Pressable
          onPress={() => void onAllow()}
          disabled={syncing}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, syncing && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Allow access to contacts"
        >
          <Text style={styles.primaryBtnTxt}>
            {doneOnce ? 'Sync contacts again' : 'Allow access to contacts'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnTxt}>Not now</Text>
        </Pressable>
      </ScrollView>
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
    backgroundColor: '#E1F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: C.text,
    lineHeight: 17,
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
  permIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEEDFE',
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
    marginBottom: 22,
  },
  bullets: {
    backgroundColor: '#F8F7F4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  syncBox: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  syncTxt: {
    fontSize: 13,
    color: C.muted,
  },
  resultsBox: {
    marginBottom: 18,
  },
  resultsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  resultsEmpty: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 20,
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
});
