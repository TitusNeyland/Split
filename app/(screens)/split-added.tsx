import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../components/shared/ServiceIcon';
import { fmtCents } from '../../lib/subscription/addSubscriptionSplitMath';
import { useSubscriptionDetailFromFirestore } from '../../lib/subscription/subscriptionDetailFromFirestore';
import { useFirebaseUid } from '../../lib/auth/useFirebaseUid';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import { useViewerFirstName } from '../hooks/useViewerFirstName';

const C = {
  muted: '#888780',
  purple: '#534AB7',
};

export default function SplitAddedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ subscriptionId?: string }>();
  const subscriptionId = typeof params.subscriptionId === 'string' ? params.subscriptionId.trim() : '';
  const firebaseUid = useFirebaseUid();
  const { avatarUrl } = useProfileAvatarUrl();
  const { firstName: viewerFirstName } = useViewerFirstName();

  const { detail, loading, error } = useSubscriptionDetailFromFirestore(
    subscriptionId,
    firebaseUid,
    avatarUrl,
    viewerFirstName,
    { enabled: Boolean(subscriptionId && firebaseUid) }
  );

  const myRow = useMemo(
    () => detail?.members.find((m) => m.memberId === firebaseUid),
    [detail, firebaseUid],
  );

  const others = useMemo(
    () =>
      (detail?.members ?? []).filter(
        (m) => m.memberId !== firebaseUid && !m.invitePending,
      ),
    [detail, firebaseUid],
  );

  const onAddPayment = () => {
    Alert.alert('Payment method', 'Connect your bank or card where you manage subscription billing.');
  };

  const onLater = () => {
    if (subscriptionId) {
      router.replace(`/subscription/${subscriptionId}`);
    } else {
      router.replace('/(tabs)');
    }
  };

  if (!subscriptionId || !firebaseUid) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.err}>Something went wrong.</Text>
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnTxt}>Home</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ActivityIndicator color="#fff" />
        <Text style={styles.loadingTxt}>Loading your split…</Text>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.err}>We couldn’t load this split.</Text>
        <Pressable onPress={onLater} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnTxt}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  const shareLine =
    detail.billingCycleLabel === 'Yearly'
      ? `${fmtCents(myRow?.amountCents ?? 0)} / year`
      : `${fmtCents(myRow?.amountCents ?? 0)} / month`;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#6B3FA0', '#4A1570', '#2D0D45']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: 28 }]}
      >
        <Text style={styles.kicker}>{`You've been added!`}</Text>
        <View style={styles.iconWrap}>
          <ServiceIcon serviceName={detail.serviceName} size={56} />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {detail.displayName}
        </Text>
        <Text style={styles.shareLine}>Your share: {shareLine}</Text>
        <Text style={styles.metaLine}>Billing date: {detail.nextBillingLabel}</Text>
        <View style={styles.autoRow}>
          <Ionicons
            name={detail.autoCharge === 'on' ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color="rgba(255,255,255,0.85)"
          />
          <Text style={styles.autoTxt}>
            Auto-charge: {detail.autoCharge === 'on' ? 'On' : 'Off'}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(insets.bottom, 20) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLbl}>Members</Text>
        <View style={styles.pipRow}>
          {others.map((m) => (
            <View key={m.memberId} style={[styles.pip, { backgroundColor: m.avatarBg }]}>
              <Text style={[styles.pipTxt, { color: m.avatarColor }]}>{m.initials}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={onAddPayment}
          accessibilityRole="button"
          accessibilityLabel="Add payment method"
        >
          <Text style={styles.primaryBtnTxt}>Add payment method</Text>
        </Pressable>

        <Pressable onPress={onLater} style={styles.laterBtn} accessibilityRole="button">
          <Text style={styles.laterTxt}>{`I'll do this later`}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#2D0D45',
  },
  loadingTxt: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  err: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ghostBtnTxt: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
  },
  hero: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
  },
  iconWrap: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  shareLine: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginTop: 4,
  },
  metaLine: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 8,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  autoTxt: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  sectionLbl: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  pipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  pip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  laterBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  laterTxt: {
    fontSize: 16,
    fontWeight: '500',
    color: C.purple,
  },
});
