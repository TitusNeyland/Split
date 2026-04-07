import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteUser,
  signOut,
} from 'firebase/auth';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  APP_MARKETING_NAME,
  HELP_WEB_URL,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO_SUBJECT,
} from '../../constants/support';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from '../../lib/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  chevron: '#C4C2BC',
  red: '#E24B4A',
  version: '#9C9BA8',
};

const ICON = {
  faq: { bg: '#1D9E75', name: 'help' as const },
  contact: { bg: '#3B82F6', name: 'chatbubble-ellipses' as const },
  payment: { bg: '#F87171', name: 'warning' as const },
  legal: { bg: '#9CA3AF', name: 'document-text' as const },
};

function openHelp() {
  if (HELP_WEB_URL) {
    router.push({
      pathname: '/profile/web-help',
      params: { url: encodeURIComponent(HELP_WEB_URL), title: 'Help' },
    });
    return;
  }
  router.push('/profile/faq');
}

function openLegal() {
  router.push('/profile/legal');
}

function openContactSupport() {
  const subject = encodeURIComponent(SUPPORT_MAILTO_SUBJECT);
  const mail = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
  void Linking.openURL(mail).catch(() => {
    Alert.alert('Could not open email', `Reach us at ${SUPPORT_EMAIL}.`);
  });
}

export default function ProfileSupportLegalSection() {
  const insets = useSafeAreaInsets();
  const versionLabel = useMemo(() => {
    const v = Constants.expoConfig?.version ?? '1.0.0';
    return `${APP_MARKETING_NAME} v${v} · Made with ♥`;
  }, []);
  const [warningOpen, setWarningOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const sheetBottomPadding = keyboardVisible ? 10 : Math.max(insets.bottom, 14);

  React.useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You will need to sign in again to use your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            if (!isFirebaseConfigured()) {
              Alert.alert('Demo', 'Firebase is not configured; nothing to sign out.');
              return;
            }
            const auth = getFirebaseAuth();
            if (!auth?.currentUser) {
              Alert.alert('Not signed in', 'Sign in from the home or security flow first.');
              return;
            }
            try {
              await signOut(auth);
              router.replace('/sign-in');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Sign out failed.';
              Alert.alert('Error', msg);
            }
          })(),
      },
    ]);
  }, []);

  const handleDeleteAccountPress = useCallback(() => {
    setWarningOpen(true);
  }, []);

  const performDeleteAccount = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      Alert.alert('Unavailable', 'Account deletion requires Firebase configuration.');
      return;
    }

    const auth = getFirebaseAuth();
    const db = getFirebaseFirestore();
    const currentUser = auth?.currentUser;
    if (!auth || !db || !currentUser) {
      Alert.alert('Not signed in', 'Sign in to delete your account.');
      return;
    }

    setDeleting(true);
    try {
      const uid = currentUser.uid;
      setWarningOpen(false);

      const memberUidsSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('memberUids', 'array-contains', uid))
      );
      const legacyMembersSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('members', 'array-contains', uid))
      );
      const byId = new Map<string, (typeof memberUidsSnap.docs)[number]>();
      for (const sub of memberUidsSnap.docs) byId.set(sub.id, sub);
      for (const sub of legacyMembersSnap.docs) byId.set(sub.id, sub);

      for (const sub of byId.values()) {
        const data = sub.data() as {
          ownerUid?: unknown;
          status?: unknown;
          members?: unknown[];
          activeMemberUids?: unknown[];
        };
        const isOwner = String(data.ownerUid ?? '') === uid;
        const isActive = String(data.status ?? '') === 'active';
        if (isOwner && isActive) {
          await updateDoc(sub.ref, {
            status: 'ended',
            endedAt: serverTimestamp(),
            endedBy: uid,
            endedReason: 'owner_account_deleted',
          });
          continue;
        }

        const activeMemberUids = Array.isArray(data.activeMemberUids) ? data.activeMemberUids : [];
        if (!activeMemberUids.includes(uid)) continue;

        const nextMembers = Array.isArray(data.members)
          ? data.members.map((member) => {
              if (!member || typeof member !== 'object') return member;
              const row = member as { uid?: unknown };
              if (String(row.uid ?? '') !== uid) return member;
              return {
                ...(member as Record<string, unknown>),
                memberStatus: 'left',
                leftAt: Timestamp.now(),
              };
            })
          : [];

        await updateDoc(sub.ref, {
          members: nextMembers,
          memberUids: arrayRemove(uid),
          activeMemberUids: arrayRemove(uid),
          splitUpdatedAt: serverTimestamp(),
        });
      }

      await deleteDoc(doc(db, 'users', uid));
      await deleteUser(currentUser);
      router.replace('/');
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Could not delete your account right now. Please try again.';
      Alert.alert('Delete account failed', msg);
    } finally {
      setDeleting(false);
    }
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionHeading}>SUPPORT & LEGAL</Text>

      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={openHelp}
          accessibilityRole="button"
          accessibilityLabel="FAQ and help center"
        >
          <View style={[styles.iconCircle, { backgroundColor: ICON.faq.bg }]}>
            <Ionicons name={ICON.faq.name} size={18} color="#fff" />
          </View>
          <Text style={styles.rowTitle}>FAQ & help center</Text>
          <Ionicons name="chevron-forward" size={18} color={C.chevron} />
        </Pressable>
        <View style={styles.hairline} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={openContactSupport}
          accessibilityRole="button"
          accessibilityLabel="Contact support"
        >
          <View style={[styles.iconCircle, { backgroundColor: ICON.contact.bg }]}>
            <Ionicons name={ICON.contact.name} size={18} color="#fff" />
          </View>
          <Text style={styles.rowTitle}>Contact support</Text>
          <Ionicons name="chevron-forward" size={18} color={C.chevron} />
        </Pressable>
        <View style={styles.hairline} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/profile/report-payment')}
          accessibilityRole="button"
          accessibilityLabel="Report a payment issue"
        >
          <View style={[styles.iconCircle, { backgroundColor: ICON.payment.bg }]}>
            <Ionicons name={ICON.payment.name} size={18} color="#fff" />
          </View>
          <Text style={styles.rowTitle}>Report a payment issue</Text>
          <Ionicons name="chevron-forward" size={18} color={C.chevron} />
        </Pressable>
        <View style={styles.hairline} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={openLegal}
          accessibilityRole="button"
          accessibilityLabel="Terms, privacy and refund policy"
        >
          <View style={[styles.iconCircle, { backgroundColor: ICON.legal.bg }]}>
            <Ionicons name={ICON.legal.name} size={18} color="#fff" />
          </View>
          <Text style={styles.rowTitle}>Terms, privacy & refund policy</Text>
          <Ionicons name="chevron-forward" size={18} color={C.chevron} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && styles.signOutBtnPressed]}
        onPress={handleDeleteAccountPress}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        <Text style={styles.deleteBtnTxt}>Delete account</Text>
      </Pressable>

      <Text style={styles.versionText}>{versionLabel}</Text>
      {Platform.OS === 'web' ? <View style={styles.webBottomPad} /> : null}

      <Modal
        visible={warningOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setWarningOpen(false)}
      >
        <View style={styles.modalWrap}>
          <TouchableWithoutFeedback onPress={() => setWarningOpen(false)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: sheetBottomPadding }]}>
            <View style={styles.handle} />
            <View style={styles.warnIconCircle}>
              <Ionicons name="warning" size={22} color="#E24B4A" />
            </View>
            <Text style={styles.sheetTitle}>Delete your account?</Text>
            <Text style={styles.sheetBody}>
              This will permanently delete your Kilo account, all your splits, and your payment
              history. This cannot be undone.
            </Text>
            <Pressable
              style={[styles.primaryDangerBtn, deleting && styles.primaryDangerBtnDisabled]}
              onPress={() => void performDeleteAccount()}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryDangerBtnText}>Delete account</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.ghostBtn, deleting && styles.ghostBtnDisabled]}
              onPress={() => setWarningOpen(false)}
              disabled={deleting}
            >
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#72727F',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  signOutBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.red,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  signOutBtnPressed: {
    opacity: 0.85,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.red,
  },
  deleteBtn: {
    width: '100%',
    padding: 14,
    backgroundColor: '#fff',
    borderColor: 'rgba(226,75,74,0.3)',
    borderWidth: 0.5,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  deleteBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E24B4A',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: C.version,
    marginBottom: 8,
  },
  webBottomPad: {
    height: 24,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#F2F0EB',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D3D1C7',
    alignSelf: 'center',
    marginBottom: 12,
  },
  warnIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FCEBEB',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryDangerBtn: {
    backgroundColor: '#E24B4A',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryDangerBtnDisabled: {
    backgroundColor: '#D3D1C7',
  },
  primaryDangerBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  ghostBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ghostBtnDisabled: {
    opacity: 0.65,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a18',
  },
});
