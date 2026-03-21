import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { isFirebaseConfigured } from '../../lib/firebase';
import {
  formatMemberSince,
  initialsFromName,
  subscribeAuthAndProfile,
  uploadProfileAvatar,
  type UserProfileDoc,
} from '../../lib/profile';
import type { User } from 'firebase/auth';

const HERO_GRADIENT = {
  colors: ['#6B3FA0', '#4A1570', '#2D0D45'] as const,
  locations: [0, 0.55, 1] as const,
  start: { x: 0.15, y: 0 },
  end: { x: 0.85, y: 1 },
};

const DEMO = {
  displayName: 'Jordan Davis',
  email: 'jordan@email.com',
  memberLabel: 'Member since March 2026',
};

const AVATAR_SIZE = 72;
const AVATAR_BORDER = 2;

function memberDateFrom(user: User | null, profile: UserProfileDoc | null): Date | null {
  const ca = profile?.createdAt;
  if (ca && typeof ca.toDate === 'function') {
    try {
      return ca.toDate();
    } catch {
      /* ignore */
    }
  }
  if (user?.metadata?.creationTime) {
    const d = new Date(user.metadata.creationTime);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    return subscribeAuthAndProfile((s) => {
      setUser(s.user);
      setProfile(s.profile);
      setProfileLoading(s.profileLoading);
    });
  }, []);

  const displayName = useMemo(() => {
    if (!isFirebaseConfigured()) return DEMO.displayName;
    const n = profile?.displayName ?? user?.displayName;
    if (n?.trim()) return n.trim();
    return 'Guest';
  }, [profile?.displayName, user?.displayName]);

  const email = useMemo(() => {
    if (!isFirebaseConfigured()) return DEMO.email;
    return profile?.email ?? user?.email ?? '';
  }, [profile?.email, user?.email]);

  const avatarUrl = isFirebaseConfigured() ? profile?.avatarUrl ?? null : null;

  const memberLabel = useMemo(() => {
    if (!isFirebaseConfigured()) return DEMO.memberLabel;
    if (profileLoading && user) return '…';
    const d = memberDateFrom(user, profile);
    return formatMemberSince(d);
  }, [user, profile, profileLoading]);

  const initials = useMemo(() => initialsFromName(displayName), [displayName]);

  const pickAvatar = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      Alert.alert(
        'Firebase not set up',
        'Add your web app keys as EXPO_PUBLIC_FIREBASE_* in .env (see .env.example), then restart Expo.'
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow photo library access to set your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingAvatar(true);
    try {
      await uploadProfileAvatar(result.assets[0].uri);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed.';
      Alert.alert('Could not update photo', msg);
    } finally {
      setUploadingAvatar(false);
    }
  }, []);

  const openEdit = useCallback(() => {
    router.push('/profile/edit');
  }, []);

  const openUpgrade = useCallback(() => {
    router.push('/profile/upgrade');
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <LinearGradient
          {...HERO_GRADIENT}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: 28 }]}
        >
          <View style={styles.topBar}>
            <Text style={styles.pageTitle}>Profile</Text>
            <Pressable
              onPress={openEdit}
              style={({ pressed }) => [styles.editPill, pressed && styles.editPillPressed]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Text style={styles.editPillText}>Edit</Text>
            </Pressable>
          </View>

          <View style={styles.heroCol}>
            <View style={styles.avatarWrap}>
              <View
                style={[
                  styles.avatarRing,
                  { width: AVATAR_SIZE + AVATAR_BORDER * 2, height: AVATAR_SIZE + AVATAR_BORDER * 2, borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2 },
                ]}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
                    accessibilityLabel="Profile photo"
                  />
                ) : (
                  <LinearGradient
                    colors={['#8B5CF6', '#5B21B6', '#4C1D95']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGradient}
                  >
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </LinearGradient>
                )}
              </View>

              <Pressable
                style={styles.pencilBtn}
                onPress={pickAvatar}
                disabled={uploadingAvatar}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#5B21B6" />
                ) : (
                  <Ionicons name="pencil" size={14} color="#5B21B6" />
                )}
              </Pressable>
            </View>

            <Text style={styles.name}>{displayName}</Text>
            {email ? <Text style={styles.email}>{email}</Text> : null}

            <Pressable
              onPress={openUpgrade}
              style={({ pressed }) => [styles.planPill, pressed && styles.planPillPressed]}
              accessibilityRole="button"
              accessibilityLabel="Upgrade plan"
            >
              <Ionicons name="star" size={14} color="#fff" style={styles.planStar} />
              <Text style={styles.planPillText}>Free plan · Upgrade</Text>
            </Pressable>

            <Text style={styles.memberSince}>{memberLabel}</Text>
          </View>
        </LinearGradient>

        <View style={styles.bodyPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  editPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  editPillPressed: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  editPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  heroCol: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  avatarWrap: {
    width: AVATAR_SIZE + 16,
    height: AVATAR_SIZE + 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarRing: {
    borderWidth: AVATAR_BORDER,
    borderColor: '#fff',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  avatarGradient: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  pencilBtn: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  email: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginBottom: 14,
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: 12,
  },
  planPillPressed: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  planStar: {
    marginRight: 6,
  },
  planPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  memberSince: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  bodyPad: {
    minHeight: 24,
    backgroundColor: '#F2F0EB',
  },
});
