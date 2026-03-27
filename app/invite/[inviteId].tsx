import React, { useCallback, useEffect, useState } from 'react';
;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import {
  acceptPendingInvite,
  fetchInviteById,
  fetchUserProfileForInvite,
  type FirestoreInvite,
  type InviteSenderProfile,
} from '../../lib/friends/friendSystemFirestore';
import { formatMemberSince, initialsFromName } from '../../lib/profile';
import { setPendingInviteId } from '../../lib/friends/pendingInviteStorage';
import { buildInviteUrl } from '../../lib/friends/inviteLinks';

function inviteIsExpired(invite: FirestoreInvite): boolean {
  if (invite.status === 'expired') return true;
  const ex = invite.expiresAt;
  if (ex instanceof Timestamp && ex.toMillis() < Date.now()) return true;
  return false;
}

function daysLeft(invite: FirestoreInvite): number {
  const ex = invite.expiresAt;
  if (!(ex instanceof Timestamp)) return 0;
  const ms = ex.toMillis() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function AcceptInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inviteId: inviteIdParam } = useLocalSearchParams<{ inviteId: string }>();
  const inviteId = typeof inviteIdParam === 'string' ? inviteIdParam : '';

  const [user, setUser] = useState<User | null>(() => getFirebaseAuth()?.currentUser ?? null);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<FirestoreInvite | null>(null);
  const [sender, setSender] = useState<InviteSenderProfile | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!inviteId) {
      setLoadError('Invalid invite link.');
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured()) {
      setLoadError('Firebase is not configured.');
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const inv = await fetchInviteById(inviteId);
        if (!alive) return;
        if (!inv) {
          setLoadError('This invite could not be found.');
          setInvite(null);
          setSender(null);
          return;
        }
        setInvite(inv);
        const profile = await fetchUserProfileForInvite(inv.createdBy);
        if (!alive) return;
        setSender(profile);
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [inviteId]);

  useEffect(() => {
    if (!inviteId || loading) return;
    if (user) {
      void setPendingInviteId(null);
      return;
    }
    if (invite && inviteIsExpired(invite)) return;
    void setPendingInviteId(inviteId);
  }, [inviteId, user, loading, invite]);

  const senderName = sender?.displayName?.trim() || 'Someone';
  const senderInitials = initialsFromName(senderName);
  const expired = invite ? inviteIsExpired(invite) : false;
  const alreadyAccepted = invite?.status === 'accepted';
  const selfInvite = Boolean(user && invite && invite.createdBy === user.uid);

  const onAccept = useCallback(async () => {
    if (!user?.uid || !invite || !inviteId) return;
    if (expired || alreadyAccepted || selfInvite) return;
    setAccepting(true);
    try {
      await acceptPendingInvite(inviteId, user.uid);
      router.replace('/friends');
    } catch (e) {
      Alert.alert('Could not connect', e instanceof Error ? e.message : 'Try again later.');
    } finally {
      setAccepting(false);
    }
  }, [user?.uid, invite, inviteId, expired, alreadyAccepted, selfInvite, router]);

  const onDecline = useCallback(() => {
    router.back();
  }, [router]);

  if (!inviteId) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errTxt}>Invalid invite.</Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnTxt}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#534AB7" />
        <Text style={styles.muted}>Loading invite…</Text>
      </View>
    );
  }

  if (loadError || !invite) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <StatusBar style="dark" />
        <Text style={styles.errTxt}>{loadError ?? 'Invite not found.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnTxt}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (expired) {
    return (
      <View style={[styles.expiredWrap, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <StatusBar style="dark" />
        <Ionicons name="time-outline" size={48} color="#888780" />
        <Text style={styles.expiredTitle}>This invite has expired</Text>
        <Text style={styles.expiredBody}>
          Ask {senderName} to send a new one.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnTxt}>OK</Text>
        </Pressable>
      </View>
    );
  }

  if (selfInvite) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <StatusBar style="dark" />
        <Text style={styles.errTxt}>You can’t accept your own invite.</Text>
        <Text style={styles.mutedSmall}>Share this link instead: {buildInviteUrl(inviteId)}</Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnTxt}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (alreadyAccepted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Text style={styles.errTxt}>This invite was already used.</Text>
        <Pressable onPress={() => router.replace('/friends')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnTxt}>Open Friends</Text>
        </Pressable>
      </View>
    );
  }

  const showAuthGate = !user && isFirebaseConfigured();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: Math.max(insets.top, 16), paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="dark" />

      <View style={styles.heroAvatars}>
        <View style={styles.avSender}>
          {sender?.avatarUrl ? (
            <Image source={{ uri: sender.avatarUrl }} style={styles.avImg} accessibilityLabel={senderName} />
          ) : (
            <LinearGradient colors={['#7F77DD', '#534AB7']} style={styles.avGrad}>
              <Text style={styles.avTxt}>{senderInitials}</Text>
            </LinearGradient>
          )}
        </View>
        <View style={styles.avPlus}>
          <Ionicons name="add" size={18} color="#534AB7" />
        </View>
        <View style={styles.avYou}>
          <Text style={styles.avYouTxt}>?</Text>
        </View>
      </View>

      <Text style={styles.title}>{senderName} invited you</Text>
      <Text style={styles.body}>
        {senderName} wants to connect with you on mySplit to split subscriptions and bills together.
      </Text>
      <Text style={styles.expiryLine}>Invite expires in {daysLeft(invite)} days</Text>

      <View style={styles.card}>
        <View style={styles.cardRow}>
          {sender?.avatarUrl ? (
            <Image source={{ uri: sender.avatarUrl }} style={styles.cardAv} />
          ) : (
            <LinearGradient colors={['#7F77DD', '#534AB7']} style={styles.cardAv}>
              <Text style={styles.cardAvTxt}>{senderInitials}</Text>
            </LinearGradient>
          )}
          <View>
            <Text style={styles.cardName}>{senderName}</Text>
            <Text style={styles.cardSub}>
              {sender?.createdAt
                ? `Member since ${formatMemberSince(sender.createdAt.toDate())}`
                : 'On mySplit'}
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>—</Text>
            <Text style={styles.statLbl}>Active splits</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>—</Text>
            <Text style={styles.statLbl}>Friends</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: '#1D9E75' }]}>
              {sender?.lifetimeSaved != null ? `$${Math.round(sender.lifetimeSaved)}` : '—'}
            </Text>
            <Text style={styles.statLbl}>Saved</Text>
          </View>
        </View>
      </View>

      {showAuthGate ? (
        <>
          <Text style={styles.authHint}>Sign in or create an account to connect.</Text>
          <Pressable onPress={() => router.push('/profile')} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnTxt}>Sign in to continue</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            onPress={onAccept}
            disabled={accepting}
            style={({ pressed }) => [
              styles.primaryBtn,
              accepting && styles.primaryBtnDisabled,
              pressed && !accepting && { opacity: 0.92 },
            ]}
          >
            {accepting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnTxt}>Accept & connect</Text>
            )}
          </Pressable>
          <Pressable onPress={onDecline} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnTxt}>Decline</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  scrollContent: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F0EB',
    gap: 12,
  },
  heroAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  avSender: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#F2F0EB',
  },
  avGrad: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avImg: {
    width: '100%',
    height: '100%',
  },
  avTxt: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  avPlus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -6,
    zIndex: 2,
  },
  avYou: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0EEE9',
    borderWidth: 3,
    borderColor: '#F2F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avYouTxt: {
    fontSize: 18,
    fontWeight: '700',
    color: '#888780',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
    marginBottom: 8,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    color: '#888780',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 6,
  },
  expiryLine: {
    fontSize: 11,
    color: '#B4B2A9',
    marginBottom: 28,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 20,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardAv: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardAvTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a18',
  },
  cardSub: {
    fontSize: 11,
    color: '#888780',
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#F0EEE9',
  },
  stat: {
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a18',
  },
  statLbl: {
    fontSize: 9,
    color: '#888780',
    marginTop: 2,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#534AB7',
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#D3D1C7',
    alignItems: 'center',
  },
  secondaryBtnTxt: {
    fontSize: 13,
    color: '#888780',
  },
  authHint: {
    fontSize: 13,
    color: '#888780',
    textAlign: 'center',
    marginBottom: 12,
  },
  muted: {
    fontSize: 14,
    color: '#888780',
  },
  mutedSmall: {
    fontSize: 12,
    color: '#888780',
    textAlign: 'center',
    marginTop: 8,
  },
  errTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a18',
    textAlign: 'center',
  },
  expiredWrap: {
    flex: 1,
    backgroundColor: '#F2F0EB',
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  expiredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
    textAlign: 'center',
  },
  expiredBody: {
    fontSize: 14,
    color: '#888780',
    textAlign: 'center',
    lineHeight: 20,
  },
});
