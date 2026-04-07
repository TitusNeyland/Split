import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Image,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { useOnboardingBack } from '../../../lib/onboarding/useOnboardingBack';
import { ProfileAvatarCropModal } from '../../../components/profile/ProfileAvatarCropModal';
import {
  clearOnboardingPhotoUri,
  readOnboardingFirstName,
  readOnboardingPhotoUri,
  setOnboardingPhotoStepDone,
  setOnboardingPhotoUri,
} from '../../../lib/onboarding/onboardingStorage';
import { getFirebaseAuth } from '../../../lib/firebase';
import { uploadOnboardingProfilePhoto } from '../../../lib/profile/profile';

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  avatarBg: '#F0EEF8',
};

export default function OnboardingPhotoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useOnboardingBack('/onboarding/find-us');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [cropVisible, setCropVisible] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [savedPhoto, savedFirst] = await Promise.all([
        readOnboardingPhotoUri(),
        readOnboardingFirstName(),
      ]);
      if (!alive) return;
      setPhotoUri(savedPhoto);
      setFirstName(savedFirst);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const title = useMemo(() => {
    if (!photoUri) return 'Add a profile photo';
    return `Looking good, ${firstName?.trim() || 'there'}!`;
  }, [photoUri, firstName]);

  const subtitle = photoUri
    ? 'Your friends will see this when you invite them to a split.'
    : "So your friends know who's splitting with them.";

  const launchTakePhoto = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('Camera', 'Camera access is needed to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCropUri(result.assets[0].uri);
    setCropVisible(true);
  }, []);

  const launchPhotoLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Photo library access is needed to choose a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCropUri(result.assets[0].uri);
    setCropVisible(true);
  }, []);

  const openPicker = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take photo', 'Choose from library'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) void launchTakePhoto();
          if (idx === 2) void launchPhotoLibrary();
        }
      );
      return;
    }
    Alert.alert('Add profile photo', '', [
      { text: 'Take photo', onPress: () => void launchTakePhoto() },
      { text: 'Choose from library', onPress: () => void launchPhotoLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [launchPhotoLibrary, launchTakePhoto]);

  const onCroppedAvatar = useCallback(async (processedUri: string) => {
    setPhotoUri(processedUri);
    await setOnboardingPhotoUri(processedUri);
  }, []);

  const onContinue = useCallback(async () => {
    if (!photoUri) return;
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (uid) {
      setUploading(true);
      try {
        await uploadOnboardingProfilePhoto(uid, photoUri);
      } catch (e) {
        setUploading(false);
        Alert.alert('Upload failed', 'Could not save your photo. Please try again.');
        return;
      }
      setUploading(false);
    }
    await setOnboardingPhotoStepDone(true);
    router.replace('/onboarding/complete');
  }, [photoUri, router]);

  const onSkip = useCallback(async () => {
    await clearOnboardingPhotoUri();
    await setOnboardingPhotoStepDone(true);
    router.replace('/onboarding/complete');
  }, [router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={12} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>

        <Pressable onPress={openPicker} style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.92 }]}>
          <View style={styles.avatarCircle}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImg} />
            ) : (
              <Svg width={58} height={58} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={8} r={4} stroke="#AFA9EC" strokeWidth={1.1} />
                <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#AFA9EC" strokeWidth={1.1} />
              </Svg>
            )}
          </View>
          <View style={[styles.badge, photoUri && styles.badgeEdit]}>
            <Ionicons name={photoUri ? 'pencil' : 'add'} size={16} color="#fff" />
          </View>
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: 26 + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (!photoUri || uploading) && styles.primaryBtnDisabled,
            pressed && photoUri && !uploading && styles.primaryBtnPressed,
          ]}
          disabled={!photoUri || uploading}
          onPress={() => void onContinue()}
        >
          <Text style={styles.primaryBtnText}>{uploading ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
        {!photoUri ? (
          <Pressable onPress={() => void onSkip()} style={({ pressed }) => [styles.skipWrap, pressed && { opacity: 0.65 }]}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        ) : null}
      </View>

      <ProfileAvatarCropModal
        visible={cropVisible}
        imageUri={cropUri}
        onClose={() => {
          setCropVisible(false);
          setCropUri(null);
        }}
        onConfirm={onCroppedAvatar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topRow: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  backBtn: { paddingVertical: 4, paddingRight: 8, alignSelf: 'flex-start' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  title: { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginBottom: 10 },
  sub: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 42, maxWidth: 300 },
  avatarWrap: { width: 150, height: 150 },
  avatarCircle: { width: 150, height: 150, borderRadius: 75, backgroundColor: C.avatarBg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  badgeEdit: { backgroundColor: '#1a1a1a' },
  footer: { paddingHorizontal: 24 },
  primaryBtn: { width: '100%', paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: C.purple },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnPressed: { opacity: 0.92 },
  primaryBtnText: { fontSize: 16, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },
  skipWrap: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  skipText: { fontSize: 14, color: C.muted, textDecorationLine: 'underline', textDecorationColor: C.muted },
});
