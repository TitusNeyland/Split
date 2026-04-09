import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from '../../../lib/firebase';
import {
  checkUsernameAvailable,
  initialsFromName,
  saveUserProfile,
  uploadProfileAvatar,
  removeProfileAvatar,
  type UserProfileDoc,
} from '../../../lib/profile';
import { ProfilePhotoActionSheet } from '../../../components/profile/ProfilePhotoActionSheet';
import { ProfileAvatarCropModal } from '../../../components/profile/ProfileAvatarCropModal';
import { Toast } from '../../../components/shared/Toast';

const C = {
  bg: '#F2F0EB',
  card: '#fff',
  text: '#1a1a18',
  muted: '#72727F',
  purple: '#534AE7',
  border: 'rgba(0,0,0,0.08)',
  inputBg: '#fff',
  sectionLabel: '#72727F',
  rowChevron: '#C7C7CC',
  error: '#E24B4A',
};

const AVATAR_SIZE = 72;

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const CAMERA_DENIED_MSG =
  'Camera access is needed to take a photo. Enable it in Settings > Split > Camera.';
const PHOTOS_DENIED_MSG =
  'Photo library access is needed. Enable it in Settings > Split > Photos.';

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();

  // --- form state ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // originals for dirty check
  const origRef = useRef({ firstName: '', lastName: '', username: '' });

  // avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [cropVisible, setCropVisible] = useState(false);

  // load
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // email / phone display
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseFirestore();
    if (!auth?.currentUser || !db) {
      setLoading(false);
      return;
    }
    const user = auth.currentUser;
    setEmail(user.email ?? '');
    setAvatarUrl(user.photoURL ?? null);

    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data() as UserProfileDoc;
          const fn = data.firstName ?? '';
          const ln = data.lastName ?? '';
          const un = data.username ?? '';
          const ph = data.phone ?? '';
          setFirstName(fn);
          setLastName(ln);
          setUsername(un);
          setPhone(ph);
          origRef.current = { firstName: fn, lastName: ln, username: un };
          if (data.photoURL) setAvatarUrl(data.photoURL);
        }
      } catch {
        // ignore read errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = useMemo(() => {
    const o = origRef.current;
    return (
      firstName.trim() !== o.firstName.trim() ||
      lastName.trim() !== o.lastName.trim() ||
      username.trim().toLowerCase() !== o.username.trim().toLowerCase()
    );
  }, [firstName, lastName, username]);

  const validateUsername = useCallback((val: string) => {
    const v = val.trim().toLowerCase();
    if (v === '') { setUsernameError(null); return true; }
    if (!USERNAME_RE.test(v)) {
      setUsernameError('3–20 chars, letters, numbers, or underscores only');
      return false;
    }
    setUsernameError(null);
    return true;
  }, []);

  const onUsernameChange = useCallback((val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    validateUsername(cleaned);
  }, [validateUsername]);

  const onSave = useCallback(async () => {
    if (!isDirty || saving) return;
    if (!isFirebaseConfigured()) {
      Alert.alert('Not configured', 'Firebase keys are missing.');
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      Alert.alert('Not signed in', 'Please sign in to edit your profile.');
      return;
    }

    if (!validateUsername(username)) return;

    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      const trimmedUsername = username.trim().toLowerCase();

      if (trimmedUsername && trimmedUsername !== origRef.current.username.trim().toLowerCase()) {
        const available = await checkUsernameAvailable(trimmedUsername, uid);
        if (!available) {
          setUsernameError('Username is already taken');
          setSaving(false);
          return;
        }
      }

      await saveUserProfile({
        firstName,
        lastName,
        username: trimmedUsername,
      });

      origRef.current = { firstName: firstName.trim(), lastName: lastName.trim(), username: trimmedUsername };
      setToastMsg('Profile updated');
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save.';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }, [isDirty, saving, username, firstName, lastName, phone, validateUsername]);

  // --- avatar handlers ---
  const launchTakePhoto = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) { Alert.alert('Camera', CAMERA_DENIED_MSG); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCropUri(result.assets[0].uri);
    setCropVisible(true);
  }, []);

  const launchPhotoLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Photos', PHOTOS_DENIED_MSG); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCropUri(result.assets[0].uri);
    setCropVisible(true);
  }, []);

  const confirmCrop = useCallback(async (processedUri: string) => {
    setCropVisible(false);
    setUploadingAvatar(true);
    try {
      const url = await uploadProfileAvatar(processedUri);
      setAvatarUrl(url);
      setToastMsg('Photo updated');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not upload photo.';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploadingAvatar(false);
    }
  }, []);

  const confirmRemovePhoto = useCallback(() => {
    Alert.alert('Remove profile photo?', 'Your initials will be shown instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await removeProfileAvatar();
              setAvatarUrl(null);
              setToastMsg('Photo removed');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Could not remove photo.';
              Alert.alert('Remove photo', msg);
            }
          })();
        },
      },
    ]);
  }, []);

  const initials = useMemo(() => {
    const n = `${firstName} ${lastName}`.trim();
    return initialsFromName(n || null);
  }, [firstName, lastName]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.purple} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={C.purple} />
        </Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <Pressable
          onPress={onSave}
          disabled={!isDirty || saving}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Save"
        >
          {saving ? (
            <ActivityIndicator size="small" color={C.purple} />
          ) : (
            <Text style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable
            onPress={() => setPhotoSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={styles.avatarWrap}
          >
            {uploadingAvatar ? (
              <View style={[styles.avatarCircle, styles.avatarLoading]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarCircle} />
            ) : (
              <View style={[styles.avatarCircle, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        {/* Personal info */}
        <Text style={styles.sectionLabel}>PERSONAL INFO</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>First name</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First"
              placeholderTextColor="#B0B0BB"
              style={styles.fieldInput}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Last name</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last"
              placeholderTextColor="#B0B0BB"
              style={styles.fieldInput}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Username</Text>
            <View style={styles.usernameInputWrap}>
              <Text style={styles.usernameAt}>@</Text>
              <TextInput
                value={username}
                onChangeText={onUsernameChange}
                placeholder="handle"
                placeholderTextColor="#B0B0BB"
                style={[styles.fieldInput, styles.usernameInput]}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />
            </View>
          </View>
          {usernameError ? (
            <Text style={styles.fieldError}>{usernameError}</Text>
          ) : null}
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.accountRow, pressed && styles.rowPressed]}
            onPress={() => router.push('/profile/change-email')}
            accessibilityRole="button"
            accessibilityLabel="Change email"
          >
            <View style={styles.accountRowLeft}>
              <Text style={styles.accountRowLabel}>Email address</Text>
              <Text style={styles.accountRowValue} numberOfLines={1}>{email || '—'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.rowChevron} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={({ pressed }) => [styles.accountRow, pressed && styles.rowPressed]}
            onPress={() => router.push('/profile/change-password')}
            accessibilityRole="button"
            accessibilityLabel="Change password"
          >
            <View style={styles.accountRowLeft}>
              <Text style={styles.accountRowLabel}>Password</Text>
              <Text style={styles.accountRowValue}>••••••••</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.rowChevron} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={({ pressed }) => [styles.accountRow, styles.accountRowLast, pressed && styles.rowPressed]}
            onPress={() => router.push('/profile/change-phone')}
            accessibilityRole="button"
            accessibilityLabel="Change phone number"
          >
            <View style={styles.accountRowLeft}>
              <Text style={styles.accountRowLabel}>Phone number</Text>
              <Text style={styles.accountRowValue}>{phone || 'Add phone number'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.rowChevron} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Photo sheet + crop */}
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
        onClose={() => setCropVisible(false)}
        onConfirm={confirmCrop}
      />

      <Toast
        message={toastMsg}
        onDismiss={() => setToastMsg(null)}
        type="success"
        showIcon
        bottom={Math.max(insets.bottom, 12)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  saveBtn: {
    fontSize: 17,
    fontWeight: '600',
    color: C.purple,
  },
  saveBtnDisabled: {
    opacity: 0.35,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 8,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarLoading: {
    backgroundColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  avatarHint: {
    fontSize: 13,
    color: C.muted,
  },
  // sections
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.sectionLabel,
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    marginBottom: 24,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 16,
  },
  // personal info fields
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldLabel: {
    width: 96,
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    flexShrink: 0,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    textAlign: 'right',
  },
  usernameInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  usernameAt: {
    fontSize: 15,
    color: C.muted,
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    maxWidth: 160,
  },
  fieldError: {
    fontSize: 12,
    color: C.error,
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginTop: -4,
  },
  // account rows
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accountRowLast: {
    // no extra style needed, just for clarity
  },
  accountRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  accountRowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    marginBottom: 2,
  },
  accountRowValue: {
    fontSize: 13,
    color: C.muted,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
