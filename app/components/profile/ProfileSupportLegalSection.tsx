import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import {
  APP_MARKETING_NAME,
  HELP_WEB_URL,
  LEGAL_WEB_URL,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO_SUBJECT,
} from '../../../constants/support';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';

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
  if (LEGAL_WEB_URL) {
    router.push({
      pathname: '/profile/web-help',
      params: { url: encodeURIComponent(LEGAL_WEB_URL), title: 'Legal' },
    });
    return;
  }
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
  const versionLabel = useMemo(() => {
    const v = Constants.expoConfig?.version ?? '1.0.0';
    return `${APP_MARKETING_NAME} v${v} · Made with ♥`;
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

      <Text style={styles.versionText}>{versionLabel}</Text>
      {Platform.OS === 'web' ? <View style={styles.webBottomPad} /> : null}
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
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: C.version,
    marginBottom: 8,
  },
  webBottomPad: {
    height: 24,
  },
});
