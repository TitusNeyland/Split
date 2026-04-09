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
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from '../../../lib/firebase';
import { normalizePhoneToE164 } from '../../../lib/friends/phoneNormalize';
import { sha256HexUtf8Js } from '../../../lib/friends/phoneHashClient';
import type { UserProfileDoc } from '../../../lib/profile';

const C = {
  bg: '#F2F0EB',
  card: '#fff',
  text: '#1a1a18',
  muted: '#72727F',
  purple: '#534AE7',
  border: 'rgba(0,0,0,0.08)',
};

export default function ChangePhoneScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseFirestore();
    if (!auth?.currentUser || !db) { setLoading(false); return; }

    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        if (snap.exists()) {
          const data = snap.data() as UserProfileDoc;
          setPhone(data.phone ?? '');
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = useCallback(async () => {
    if (saving) return;
    if (!isFirebaseConfigured()) {
      Alert.alert('Not configured', 'Firebase keys are missing.');
      return;
    }
    const auth = getFirebaseAuth();
    const db = getFirebaseFirestore();
    const user = auth?.currentUser;
    if (!user || !db) {
      Alert.alert('Not signed in', 'Please sign in to update your phone number.');
      return;
    }

    const trimmed = phone.trim();

    // If clearing the phone
    if (!trimmed) {
      setSaving(true);
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          { phone: null, phoneHash: null, updatedAt: serverTimestamp() },
          { merge: true }
        );
        router.back();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save.';
        Alert.alert('Save failed', msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    const e164 = normalizePhoneToE164(trimmed);
    if (!e164) {
      Alert.alert(
        'Invalid phone number',
        'Enter a valid phone number including area code, e.g. (555) 867-5309 or +1 555 867 5309.'
      );
      return;
    }

    setSaving(true);
    try {
      const phoneHash = sha256HexUtf8Js(e164);
      await setDoc(
        doc(db, 'users', user.uid),
        {
          phone: e164,
          phoneHash,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save.';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }, [saving, phone]);

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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={C.purple} />
        </Pressable>
        <Text style={styles.title}>Phone number</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sub}>
          Your phone number is used to match you with contacts who have Split. Leave blank to remove it.
        </Text>

        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Ionicons name="call-outline" size={18} color={C.muted} style={styles.fieldIcon} />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 867-5309"
              placeholderTextColor="#B0B0BB"
              style={styles.fieldInput}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!saving}
            />
          </View>
        </View>

        <Text style={styles.hint}>
          US numbers: enter 10 digits. International: include country code (+44…).
        </Text>

        <Pressable
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save phone number"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnTxt}>Save</Text>
          )}
        </Pressable>
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sub: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  fieldIcon: {
    flexShrink: 0,
  },
  fieldInput: {
    flex: 1,
    fontSize: 17,
    color: C.text,
  },
  hint: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  submitBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
