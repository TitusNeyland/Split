import React, { useEffect, useState } from 'react';
;
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { InviteShareSheetPanel } from './InviteShareSheetPanel';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import { createPendingInvite } from '../../../lib/friends/friendSystemFirestore';
import { buildInviteShareMessage, buildInviteUrl } from '../../../lib/friends/inviteLinks';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom-sheet style invite flow (same behavior as `/invite-share`) for use on the Friends hub.
 */
export default function FriendsInviteModal({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setInviteId(null);
      setCreateError(null);
      setFatalError(null);
      setCreating(false);
      return;
    }
    if (!isFirebaseConfigured()) {
      setAuthReady(true);
      setFatalError('Firebase is not configured.');
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthReady(true);
      setFatalError('Auth is not available.');
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, [visible]);

  useEffect(() => {
    if (!visible || !authReady || !user?.uid || fatalError || createError) return;
    let cancelled = false;
    (async () => {
      setCreating(true);
      setCreateError(null);
      try {
        const id = await createPendingInvite({
          creatorUid: user.uid,
          connectedVia: 'direct_invite',
        });
        if (!cancelled) setInviteId(id);
      } catch (e) {
        if (!cancelled) {
          setCreateError(e instanceof Error ? e.message : 'Could not create invite.');
        }
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, authReady, user?.uid, fatalError, createError]);

  const inviteUrl = inviteId ? buildInviteUrl(inviteId) : '';
  const shareMessage = inviteId ? buildInviteShareMessage(inviteId) : '';
  const showSignIn = authReady && !user && isFirebaseConfigured() && !fatalError;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {!authReady || creating ? (
          <View style={styles.loadingSheet}>
            <ActivityIndicator color="#534AB7" />
            <Text style={styles.loadingTxt}>{!authReady ? 'Loading…' : 'Creating your invite…'}</Text>
          </View>
        ) : fatalError ? (
          <View style={styles.loadingSheet}>
            <Text style={styles.errorTxt}>{fatalError}</Text>
            <Pressable onPress={onClose} style={styles.retryBtn}>
              <Text style={styles.retryBtnTxt}>Close</Text>
            </Pressable>
          </View>
        ) : showSignIn ? (
          <View style={styles.loadingSheet}>
            <Text style={styles.errorTxt}>Sign in to create an invite link.</Text>
            <Pressable onPress={() => router.push('/profile')} style={styles.retryBtn}>
              <Text style={styles.retryBtnTxt}>Go to Profile</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.textBtn}>
              <Text style={styles.textBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        ) : createError ? (
          <View style={styles.loadingSheet}>
            <Text style={styles.errorTxt}>{createError}</Text>
            <Pressable
              onPress={() => {
                setCreateError(null);
                setInviteId(null);
              }}
              style={styles.retryBtn}
            >
              <Text style={styles.retryBtnTxt}>Retry</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.textBtn}>
              <Text style={styles.textBtnTxt}>Close</Text>
            </Pressable>
          </View>
        ) : inviteId ? (
          <InviteShareSheetPanel inviteUrl={inviteUrl} shareMessage={shareMessage} onClose={onClose} />
        ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  loadingSheet: {
    backgroundColor: '#F2F0EB',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  loadingTxt: {
    fontSize: 14,
    color: '#888780',
  },
  errorTxt: {
    fontSize: 14,
    color: '#1a1a18',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#534AB7',
    borderRadius: 12,
  },
  retryBtnTxt: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  textBtn: {
    paddingVertical: 8,
  },
  textBtnTxt: {
    fontSize: 14,
    color: '#888780',
    fontWeight: '500',
  },
});
