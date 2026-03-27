import React, { useCallback, useEffect, useMemo, useState } from 'react';
;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  PAYMENT_ISSUE_TYPES,
  SUBSCRIPTION_CHOICES,
  type PaymentIssueTypeValue,
} from '../../../constants/support';

type SubscriptionChoiceValue = (typeof SUBSCRIPTION_CHOICES)[number]['value'];
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import { submitPaymentIssueViaApi } from '../../../lib/payment/submitPaymentIssueApi';
import { submitPaymentIssueToFirestore } from '../../../lib/payment/supportRequestsFirestore';

export default function ReportPaymentScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionChoiceValue>(
    SUBSCRIPTION_CHOICES[0]!.value
  );
  const [issueType, setIssueType] = useState<PaymentIssueTypeValue>(
    PAYMENT_ISSUE_TYPES[0]!.value
  );
  const [description, setDescription] = useState('');
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  const subLabel = useMemo(
    () => SUBSCRIPTION_CHOICES.find((c) => c.value === subscription)?.label ?? subscription,
    [subscription]
  );
  const issueLabel = useMemo(
    () => PAYMENT_ISSUE_TYPES.find((c) => c.value === issueType)?.label ?? issueType,
    [issueType]
  );

  const submit = useCallback(async () => {
    const desc = description.trim();
    if (desc.length < 8) {
      Alert.alert('Description', 'Please add a bit more detail (at least 8 characters).');
      return;
    }
    if (!isFirebaseConfigured() || !user) {
      Alert.alert(
        'Sign in required',
        'Sign in with Firebase to submit a payment issue, or use Contact support to email us.'
      );
      return;
    }

    const payload = {
      subscription: subLabel,
      issueType,
      description: desc,
    };

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      try {
        await submitPaymentIssueViaApi(token, payload);
      } catch (apiErr) {
        try {
          await submitPaymentIssueToFirestore(user.uid, user.email ?? null, payload);
          Alert.alert(
            'Submitted',
            'Your report was saved. If the server is offline, email notification may be delayed.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        } catch {
          throw apiErr;
        }
      }
      Alert.alert('Thanks', 'We received your report and will follow up by email.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      Alert.alert('Could not submit', msg);
    } finally {
      setSubmitting(false);
    }
  }, [description, issueType, subLabel, user]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color="#534AB7" />
          </Pressable>
          <Text style={styles.headerTitle}>Report payment issue</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Subscription</Text>
          <Pressable
            style={styles.selectBtn}
            onPress={() => setSubPickerOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.selectBtnText}>{subLabel}</Text>
            <Ionicons name="chevron-down" size={18} color="#534AB7" />
          </Pressable>

          <Text style={styles.label}>Issue type</Text>
          <Pressable
            style={styles.selectBtn}
            onPress={() => setIssuePickerOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.selectBtnText}>{issueLabel}</Text>
            <Ionicons name="chevron-down" size={18} color="#534AB7" />
          </Pressable>

          <Text style={styles.label}>Describe what happened</Text>
          <TextInput
            style={styles.input}
            multiline
            textAlignVertical="top"
            placeholder="Include dates, amounts, and what you expected to happen."
            placeholderTextColor="#aaa"
            value={description}
            onChangeText={setDescription}
          />

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (submitting || !user) && styles.submitBtnDisabled,
              pressed && styles.submitBtnPressed,
            ]}
            onPress={() => void submit()}
            disabled={submitting || !user}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </Pressable>

          {!user && isFirebaseConfigured() ? (
            <Text style={styles.hint}>Sign in to submit this form.</Text>
          ) : null}
          {!isFirebaseConfigured() ? (
            <Text style={styles.hint}>Configure Firebase to submit from the app, or use Contact support.</Text>
          ) : null}
        </ScrollView>

        <PickerModal
          visible={subPickerOpen}
          title="Subscription"
          onClose={() => setSubPickerOpen(false)}
          options={SUBSCRIPTION_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
          selected={subscription}
          onSelect={(v) => {
            setSubscription(v as SubscriptionChoiceValue);
            setSubPickerOpen(false);
          }}
        />
        <PickerModal
          visible={issuePickerOpen}
          title="Issue type"
          onClose={() => setIssuePickerOpen(false)}
          options={PAYMENT_ISSUE_TYPES.map((c) => ({ value: c.value, label: c.label }))}
          selected={issueType}
          onSelect={(v) => {
            setIssueType(v as PaymentIssueTypeValue);
            setIssuePickerOpen(false);
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function PickerModal({
  visible,
  title,
  onClose,
  options,
  selected,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((o) => (
            <Pressable
              key={o.value}
              style={({ pressed }) => [
                styles.modalRow,
                selected === o.value && styles.modalRowSelected,
                pressed && styles.modalRowPressed,
              ]}
              onPress={() => onSelect(o.value)}
            >
              <Text
                style={[styles.modalRowText, selected === o.value && styles.modalRowTextSelected]}
              >
                {o.label}
              </Text>
              {selected === o.value ? (
                <Ionicons name="checkmark-circle" size={22} color="#534AB7" />
              ) : null}
            </Pressable>
          ))}
          <Pressable style={styles.modalCancel} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a18',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginTop: 14,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a18',
  },
  input: {
    minHeight: 120,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: 14,
    fontSize: 15,
    color: '#1a1a18',
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: '#534AB7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnPressed: {
    opacity: 0.9,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#F2F0EB',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
    paddingTop: 12,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a18',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  modalRowSelected: {
    backgroundColor: 'rgba(83, 74, 183, 0.08)',
  },
  modalRowPressed: {
    opacity: 0.85,
  },
  modalRowText: {
    fontSize: 16,
    color: '#1a1a18',
  },
  modalRowTextSelected: {
    fontWeight: '600',
    color: '#534AB7',
  },
  modalCancel: {
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#534AB7',
  },
});
