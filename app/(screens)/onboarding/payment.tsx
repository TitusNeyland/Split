import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { getFirebaseAuth } from '../../../lib/firebase';
import { saveOnboardingStripePaymentMethodId } from '../../../lib/onboarding/onboardingPaymentFirestore';
import {
  setOnboardingPaymentStepDone,
} from '../../../lib/onboarding/onboardingStorage';

const STRIPE_CONFIGURED = Boolean(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  inputBg: '#F5F3EE',
  borderHairline: '#E8E6E1',
};

function LockIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={11} width={18} height={11} rx={2} stroke="#888780" strokeWidth={1.5} />
      <Path
        d="M7 11V7a5 5 0 0110 0v4"
        stroke="#888780"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function BrandBadges() {
  return (
    <View style={styles.brandRow}>
      <View style={[styles.brandBadge, styles.badgeVisa]}>
        <Text style={styles.badgeTxtVisa}>VISA</Text>
      </View>
      <View style={[styles.brandBadge, styles.badgeMc]}>
        <Text style={styles.badgeTxtMc}>MC</Text>
      </View>
    </View>
  );
}

function PaymentWithStripe() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createPaymentMethod } = useStripe();

  const [nameOnCard, setNameOnCard] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const name = getFirebaseAuth()?.currentUser?.displayName?.trim();
    if (name) setNameOnCard(name);
  }, []);

  const canAdd = useMemo(
    () => cardComplete && nameOnCard.trim().length > 0 && !busy,
    [cardComplete, nameOnCard, busy]
  );

  const goNext = useCallback(async () => {
    await setOnboardingPaymentStepDone();
    router.replace('/onboarding/find-us');
  }, [router]);

  const onAddCard = useCallback(async () => {
    if (!canAdd) return;
    setBusy(true);
    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: { name: nameOnCard.trim() },
        },
      });
      if (error) {
        Alert.alert('Card error', error.message ?? 'Could not add card.');
        return;
      }
      if (!paymentMethod?.id) {
        Alert.alert('Card error', 'No payment method was returned.');
        return;
      }
      await saveOnboardingStripePaymentMethodId(paymentMethod.id);
      await goNext();
    } catch {
      Alert.alert('Something went wrong', 'Try again.');
    } finally {
      setBusy(false);
    }
  }, [canAdd, createPaymentMethod, nameOnCard, goNext]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topRow}>
          <Pressable onPress={goNext} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Add a payment method</Text>
          <Text style={styles.sub}>
            So others can charge you, and you can collect from your group.
          </Text>

          <View style={styles.stripeBadge}>
            <LockIcon />
            <Text style={styles.stripeBadgeTxt}>
              Secured by Stripe · your card is never stored on our servers
            </Text>
          </View>

          <View style={styles.cardShell}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardNumLabel}>Card number</Text>
              <BrandBadges />
            </View>
            <View style={styles.cardFieldHairline} />
            <CardField
              postalCodeEnabled={false}
              onCardChange={(c) => setCardComplete(Boolean(c.complete))}
              cardStyle={{
                backgroundColor: 'transparent',
                borderWidth: 0,
                textColor: C.text,
                fontSize: 16,
                placeholderColor: C.muted,
              }}
              style={styles.cardField}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Name on card</Text>
            <TextInput
              value={nameOnCard}
              onChangeText={setNameOnCard}
              style={styles.nameInput}
              autoCapitalize="words"
              editable={!busy}
              placeholder="Name as it appears on card"
              placeholderTextColor={C.muted}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canAdd || busy) && styles.btnDisabled,
              pressed && canAdd && !busy && styles.btnPressed,
            ]}
            onPress={onAddCard}
            disabled={!canAdd || busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Add card</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
            onPress={goNext}
            disabled={busy}
          >
            <Text style={styles.ghostText}>{"I'll do this later"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function PaymentWithoutStripe() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goNext = useCallback(async () => {
    await setOnboardingPaymentStepDone();
    router.replace('/onboarding/find-us');
  }, [router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goNext} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Add a payment method</Text>
        <Text style={styles.sub}>
          So others can charge you, and you can collect from your group.
        </Text>
        <View style={styles.stripeBadge}>
          <LockIcon />
          <Text style={styles.stripeBadgeTxt}>
            Secured by Stripe · your card is never stored on our servers
          </Text>
        </View>
        <Text style={styles.noStripeHint}>
          Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to use card entry in this build.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={goNext}>
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={goNext}>
          <Text style={styles.ghostText}>{"I'll do this later"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function OnboardingPaymentScreen() {
  if (!STRIPE_CONFIGURED) {
    return <PaymentWithoutStripe />;
  }
  return <PaymentWithStripe />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  skip: {
    fontSize: 13,
    color: C.muted,
  },
  scroll: { flex: 1 },
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
    marginBottom: 16,
  },
  stripeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.inputBg,
    borderRadius: 10,
    padding: 8,
    marginBottom: 16,
  },
  stripeBadgeTxt: {
    flex: 1,
    fontSize: 11,
    color: C.muted,
  },
  cardShell: {
    backgroundColor: C.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardNumLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  brandRow: {
    flexDirection: 'row',
    gap: 6,
  },
  brandBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: C.borderHairline,
  },
  badgeVisa: {
    backgroundColor: '#fff',
  },
  badgeMc: {
    backgroundColor: '#fff',
  },
  badgeTxtVisa: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1A1F71',
  },
  badgeTxtMc: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EB001B',
  },
  cardFieldHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.borderHairline,
    marginBottom: 4,
  },
  cardField: {
    width: '100%',
    height: Platform.select({ ios: 52, android: 56, default: 52 }),
  },
  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 5,
  },
  nameInput: {
    backgroundColor: C.inputBg,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: C.text,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  primaryBtn: {
    marginTop: 8,
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPressed: {
    opacity: 0.92,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
  ghostBtn: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  ghostText: {
    fontSize: 14,
    color: C.text,
    textDecorationLine: 'underline',
    textDecorationColor: C.text,
  },
  noStripeHint: {
    fontSize: 13,
    color: C.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
});
