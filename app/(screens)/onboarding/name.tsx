import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useOnboardingBack } from '../../../lib/onboarding/useOnboardingBack';
import { Ionicons } from '@expo/vector-icons';
import { saveOnboardingLegalName } from '../../../lib/profile';
import { ensureOnboardingAuthUid } from '../../../lib/onboarding/onboardingGoals';
import { isFirebaseConfigured } from '../../../lib/firebase';
import { setOnboardingFirstName, setOnboardingNameSaved } from '../../../lib/onboarding/onboardingStorage';

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  inputBg: '#F5F3EE',
};

const MAX_NAME_LEN = 50;

export default function OnboardingNameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useOnboardingBack('/onboarding/goals');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstFocused, setFirstFocused] = useState(false);
  const [lastFocused, setLastFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  const canContinue = useMemo(() => {
    const f = firstName.trim();
    const l = lastName.trim();
    return f.length > 0 && l.length > 0 && f.length <= MAX_NAME_LEN && l.length <= MAX_NAME_LEN;
  }, [firstName, lastName]);

  const onContinue = useCallback(async () => {
    if (!canContinue) return;
    if (!isFirebaseConfigured()) {
      Alert.alert('Setup required', 'Firebase is not configured.');
      return;
    }
    setSaving(true);
    try {
      const uid = await ensureOnboardingAuthUid();
      if (!uid) {
        Alert.alert('Could not continue', 'Check your connection and try again.');
        return;
      }
      await saveOnboardingLegalName(firstName, lastName);
      await setOnboardingNameSaved();
      await setOnboardingFirstName(firstName);
      router.replace('/onboarding/email');
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [canContinue, firstName, lastName, router]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topRow}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>What's your name?</Text>
          <Text style={styles.sub}>So your friends know who's requesting money from them.</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>First name</Text>
            <TextInput
              value={firstName}
              onChangeText={(t) => setFirstName(t.slice(0, MAX_NAME_LEN))}
              style={[styles.input, firstFocused && styles.inputFocused]}
              onFocus={() => setFirstFocused(true)}
              onBlur={() => setFirstFocused(false)}
              autoCapitalize="words"
              autoCorrect
              autoFocus
              maxLength={MAX_NAME_LEN}
              editable={!saving}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Last name</Text>
            <TextInput
              value={lastName}
              onChangeText={(t) => setLastName(t.slice(0, MAX_NAME_LEN))}
              style={[styles.input, lastFocused && styles.inputFocused]}
              onFocus={() => setLastFocused(true)}
              onBlur={() => setLastFocused(false)}
              autoCapitalize="words"
              autoCorrect
              maxLength={MAX_NAME_LEN}
              editable={!saving}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canContinue || saving) && styles.primaryBtnDisabled,
              pressed && canContinue && !saving && styles.primaryBtnPressed,
            ]}
            onPress={onContinue}
            disabled={!canContinue || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 28 * 1.15,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 15 * 1.5,
    marginBottom: 24,
  },
  fieldWrap: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 5,
  },
  input: {
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: C.text,
  },
  inputFocused: {
    borderColor: C.purple,
    backgroundColor: C.bg,
  },
  primaryBtn: {
    marginTop: 16,
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
});
