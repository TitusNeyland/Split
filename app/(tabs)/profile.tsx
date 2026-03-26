import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ProfilePhotoActionSheet } from '../components/ProfilePhotoActionSheet';
import { ProfileAvatarCropModal } from '../components/ProfileAvatarCropModal';
import { UserAvatarCircle } from '../components/UserAvatarCircle';
import ProfileStatsCard from '../components/ProfileStatsCard';
import ProfileFriendsBalancesCard from '../components/ProfileFriendsBalancesCard';
import ProfilePaymentMethodsCard from '../components/ProfilePaymentMethodsCard';
import ProfileNotificationSettingsCard from '../components/ProfileNotificationSettingsCard';
import ProfileSplitPreferencesCard from '../components/ProfileSplitPreferencesCard';
import ProfilePrivacyCard from '../components/ProfilePrivacyCard';
import ProfileSecurityCard from '../components/ProfileSecurityCard';
import ProfileActiveSessionsCard from '../components/ProfileActiveSessionsCard';
import ProfileSupportLegalSection from '../components/ProfileSupportLegalSection';
import { ENABLE_PROFILE_SECURITY } from '../../constants/features';
import { isFirebaseConfigured } from '../../lib/firebase';
import {
  formatMemberSince,
  initialsFromName,
  subscribeAuthAndProfile,
  uploadProfileAvatar,
  removeProfileAvatar,
  type UserProfileDoc,
} from '../../lib/profile';
// LOCAL_PROFILE_AVATAR_OFFLINE — `persistLocalAvatar` / `clearLocalAvatar` / `localAvatarHydrated` go away with local-only avatar code (see lib/localProfileAvatarStorage.ts).
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import type { User } from 'firebase/auth';

const HERO_GRADIENT = {
  colors: ['#6B3FA0', '#4A1570', '#2D0D45'] as const,
  locations: [0, 0.55, 1] as const,
  start: { x: 0.15, y: 0 },
  end: { x: 0.85, y: 1 },
};

const DEMO = {
  displayName: 'Titus Neyland',
  email: 'titus@email.com',
  memberLabel: 'Member since March 2026',
};

const AVATAR_SIZE = 72;
const AVATAR_BORDER = 2;

const CAMERA_DENIED_MSG =
  'Camera access is needed to take a photo. Enable it in Settings > Split > Camera.';
const PHOTOS_DENIED_MSG =
  'Photo library access is needed. Enable it in Settings > Split > Photos.';

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
  const {
    avatarUrl,
    persistLocalAvatar,
    clearLocalAvatar,
    localAvatarHydrated,
  } = useProfileAvatarUrl();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [cropVisible, setCropVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [authHydrated, setAuthHydrated] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthHydrated(true);
      return;
    }
    return subscribeAuthAndProfile((s) => {
      setUser(s.user);
      setProfile(s.profile);
      setProfileLoading(s.profileLoading);
      setAuthHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured() || !authHydrated) return;
    if (!user || user.isAnonymous) {
      router.replace('/sign-in');
    }
  }, [user, authHydrated]);

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

  const memberLabel = useMemo(() => {
    if (!isFirebaseConfigured()) return DEMO.memberLabel;
    if (profileLoading && user) return '…';
    const d = memberDateFrom(user, profile);
    return formatMemberSince(d);
  }, [user, profile, profileLoading]);

  const initials = useMemo(() => initialsFromName(displayName), [displayName]);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      toastOpacity.setValue(0);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    },
    [toastOpacity]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, 2500);
    return () => clearTimeout(t);
  }, [toast, toastOpacity]);

  const openPhotoOptions = useCallback(() => {
    setPhotoSheetOpen(true);
  }, []);

  const launchTakePhoto = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('Camera', CAMERA_DENIED_MSG);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCropUri(result.assets[0].uri);
    setCropVisible(true);
  }, []);

  const launchPhotoLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', PHOTOS_DENIED_MSG);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCropUri(result.assets[0].uri);
    setCropVisible(true);
  }, []);

  const confirmRemovePhoto = useCallback(() => {
    Alert.alert(
      'Remove profile photo?',
      'Your initials will be shown instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                // LOCAL_PROFILE_AVATAR_OFFLINE — keep only `removeProfileAvatar()` after dropping local storage.
                if (isFirebaseConfigured()) {
                  await removeProfileAvatar();
                } else {
                  await clearLocalAvatar();
                }
                showToast('Profile photo removed');
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Could not remove photo.';
                Alert.alert('Remove photo', msg);
              }
            })();
          },
        },
      ]
    );
  }, [clearLocalAvatar, showToast]);

  const onCroppedAvatar = useCallback(
    async (processedUri: string) => {
      setUploadingAvatar(true);
      try {
        // LOCAL_PROFILE_AVATAR_OFFLINE — keep only `uploadProfileAvatar` path when Firebase is required.
        if (isFirebaseConfigured()) {
          await uploadProfileAvatar(processedUri);
          showToast('Profile photo updated');
        } else {
          await persistLocalAvatar(processedUri);
          showToast('Profile photo saved on this device');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save photo.';
        Alert.alert('Could not update photo', msg);
      } finally {
        setUploadingAvatar(false);
      }
    },
    [persistLocalAvatar, showToast]
  );

  const openEdit = useCallback(() => {
    router.push('/profile/edit');
  }, []);

  const openUpgrade = useCallback(() => {
    router.push('/profile/upgrade');
  }, []);

  // LOCAL_PROFILE_AVATAR_OFFLINE — use only `Boolean(user && profileLoading)` after removing local avatar hydration.
  const avatarLoading = isFirebaseConfigured()
    ? Boolean(user && profileLoading)
    : !localAvatarHydrated;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
        style={uploadingAvatar ? styles.scrollDimmed : undefined}
      >
        <View style={styles.heroBlock}>
        <LinearGradient
          {...HERO_GRADIENT}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: 48 }]}
        >
          <View style={styles.topBar}>
            <Text style={styles.pageTitle}>Profile</Text>
            <Pressable
              onPress={openEdit}
              disabled={uploadingAvatar}
              style={({ pressed }) => [
                styles.editPill,
                pressed && styles.editPillPressed,
                uploadingAvatar && styles.editPillDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Text style={[styles.editPillText, uploadingAvatar && styles.editPillTextDisabled]}>Edit</Text>
            </Pressable>
          </View>

          <View style={styles.heroCol}>
            <View style={styles.avatarWrap}>
              <View
                style={[
                  styles.avatarRing,
                  {
                    width: AVATAR_SIZE + AVATAR_BORDER * 2,
                    height: AVATAR_SIZE + AVATAR_BORDER * 2,
                    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2,
                  },
                ]}
              >
                <UserAvatarCircle
                  size={AVATAR_SIZE}
                  initials={initials}
                  imageUrl={avatarUrl}
                  loading={avatarLoading}
                  showSpinner={uploadingAvatar}
                  onPress={openPhotoOptions}
                  accessibilityLabel="Profile photo — change"
                />
              </View>

              <Pressable
                style={styles.pencilBtn}
                onPress={openPhotoOptions}
                disabled={uploadingAvatar}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
              >
                <Ionicons name="pencil" size={14} color="#5B21B6" />
              </Pressable>
            </View>

            <Text style={styles.name}>{displayName}</Text>
            {email ? <Text style={styles.email}>{email}</Text> : null}

            {uploadingAvatar ? (
              // LOCAL_PROFILE_AVATAR_OFFLINE — use only “Uploading photo…” after removing local path.
              <Text style={styles.uploadingLabel}>
                {isFirebaseConfigured() ? 'Uploading photo…' : 'Saving photo…'}
              </Text>
            ) : (
              <Pressable
                onPress={openUpgrade}
                style={({ pressed }) => [styles.planPill, pressed && styles.planPillPressed]}
                accessibilityRole="button"
                accessibilityLabel="Upgrade plan"
              >
                <Ionicons name="star" size={14} color="#fff" style={styles.planStar} />
                <Text style={styles.planPillText}>Free plan · Upgrade</Text>
              </Pressable>
            )}

            <Text style={styles.memberSince}>{memberLabel}</Text>
          </View>
        </LinearGradient>

        <View style={styles.statsOverlap}>
          <ProfileStatsCard uid={user?.uid ?? null} demoMode={!isFirebaseConfigured()} />
        </View>
        </View>

        <View style={styles.friendsSection}>
          <Text style={styles.sectionHeading}>FRIENDS & GROUPS</Text>
          <ProfileFriendsBalancesCard userInitials={initials} userAvatarUrl={avatarUrl} />
        </View>

        <View style={styles.paymentSection}>
          <Text style={styles.sectionHeading}>PAYMENT METHODS</Text>
          <ProfilePaymentMethodsCard
            user={user}
            userEmail={email}
            stripeCustomerId={profile?.stripeCustomerId ?? null}
          />
        </View>

        <View style={styles.notificationsSection}>
          <Text style={styles.sectionHeading}>NOTIFICATIONS</Text>
          <ProfileNotificationSettingsCard
            user={user}
            notificationPreferences={profile?.notificationPreferences}
            persist={isFirebaseConfigured() && !!user}
          />
        </View>

        <View style={styles.splitPreferencesSection}>
          <Text style={styles.sectionHeading}>SPLIT PREFERENCES</Text>
          <ProfileSplitPreferencesCard
            user={user}
            splitPreferences={profile?.splitPreferences}
            persist={isFirebaseConfigured() && !!user}
          />
        </View>

        <View style={styles.privacySection}>
          <Text style={styles.sectionHeading}>PRIVACY</Text>
          <ProfilePrivacyCard
            user={user}
            privacySettings={profile?.privacySettings}
            persist={isFirebaseConfigured() && !!user}
            userLabelForExport={displayName}
          />
        </View>

        {ENABLE_PROFILE_SECURITY ? (
          <View style={styles.securitySection}>
            <Text style={styles.sectionHeading}>SECURITY</Text>
            <ProfileSecurityCard user={user} />
          </View>
        ) : null}

        <View style={styles.activeSessionsSection}>
          <Text style={styles.sectionHeading}>ACTIVE SESSIONS</Text>
          <ProfileActiveSessionsCard
            user={user}
            persist={isFirebaseConfigured() && !!user}
          />
        </View>

        <ProfileSupportLegalSection />

        <View style={styles.bodyPad} />
      </ScrollView>

      <ProfilePhotoActionSheet
        visible={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        hasPhoto={Boolean(avatarUrl)}
        onTakePhoto={launchTakePhoto}
        onChooseLibrary={launchPhotoLibrary}
        onRemovePhoto={confirmRemovePhoto}
      />

      <ProfileAvatarCropModal
        visible={cropVisible}
        imageUri={cropUri}
        onClose={() => {
          setCropVisible(false);
          setCropUri(null);
        }}
        onConfirm={onCroppedAvatar}
      />

      {toast ? (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
          {toast.toLowerCase().includes('updated') ? (
            <Ionicons name="checkmark" size={16} color="#fff" />
          ) : null}
          <Text style={styles.toastTxt}>{toast}</Text>
        </Animated.View>
      ) : null}
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
  heroBlock: {
    position: 'relative',
    zIndex: 0,
  },
  hero: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  statsOverlap: {
    marginTop: -18,
    paddingHorizontal: 20,
    marginBottom: 12,
    zIndex: 1,
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
  editPillDisabled: {
    opacity: 0.4,
  },
  editPillTextDisabled: {
    opacity: 0.95,
  },
  scrollDimmed: {
    opacity: 0.65,
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
  uploadingLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 12,
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
  friendsSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  paymentSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  notificationsSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  splitPreferencesSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  privacySection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  securitySection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  activeSessionsSection: {
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
  bodyPad: {
    minHeight: 24,
    backgroundColor: '#F2F0EB',
  },
  toast: {
    position: 'absolute',
    bottom: 88,
    left: 24,
    right: 24,
    alignSelf: 'center',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1D9E75',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  toastTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
