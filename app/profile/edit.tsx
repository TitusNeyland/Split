import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { saveUserDisplayName } from '../../lib/profile';

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    setName(auth?.currentUser?.displayName ?? '');
  }, []);

  const onSave = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      Alert.alert('Firebase not configured', 'Add EXPO_PUBLIC_FIREBASE_* keys to use profile sync.');
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      Alert.alert('Not signed in', 'Open the profile tab and set a photo to sign in, then try again.');
      return;
    }
    setSaving(true);
    try {
      await saveUserDisplayName(name);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save.';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }, [name]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color="#534AB7" />
        </Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#8B8B9A"
          style={styles.input}
          autoCapitalize="words"
          editable={!saving}
        />
      </View>

      <Pressable
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Save profile"
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveTxt}>Save</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#72727F',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    color: '#1a1a18',
  },
  saveBtn: {
    backgroundColor: '#534AE7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
