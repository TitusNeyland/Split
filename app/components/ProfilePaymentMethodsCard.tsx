import React, { useCallback, useEffect, useMemo, useState } from 'react';
;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import type { User } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import { saveStripeCustomerId } from '../../lib/profile';
import {
  stripeCreateCustomer,
  stripeCreateSetupIntent,
  stripeDetachPaymentMethod,
  stripeListPaymentMethods,
  stripeSetDefaultPaymentMethod,
} from '../../lib/stripeApi';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  purple: '#534AB7',
  greenBg: '#E1F5EE',
  greenFg: '#0F6E56',
  divider: '#F5F3EE',
  red: '#E24B4A',
};

export type SavedCardPm = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

function brandBadge(brand: string): { label: string; bg: string; fg: string } {
  const b = brand.toLowerCase();
  if (b === 'visa') return { label: 'VISA', bg: '#1A1F71', fg: '#fff' };
  if (b === 'mastercard') return { label: 'MC', bg: '#1A1F71', fg: '#fff' };
  if (b === 'amex') return { label: 'AMEX', bg: '#006FCF', fg: '#fff' };
  if (b === 'discover') return { label: 'DISC', bg: '#FF6000', fg: '#fff' };
  return { label: brand.slice(0, 4).toUpperCase() || 'CARD', bg: '#374151', fg: '#fff' };
}

function formatExpiry(month: number, year: number): string {
  const m = String(month || 0).padStart(2, '0');
  const y = String(year || 0).slice(-2);
  return `${m}/${y}`;
}

function displayBrandName(brand: string): string {
  const b = brand.toLowerCase();
  if (b === 'visa') return 'Visa';
  if (b === 'mastercard') return 'Mastercard';
  if (b === 'amex') return 'Amex';
  if (b === 'discover') return 'Discover';
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function hasStripePublishableKey(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
}

type BaseProps = {
  user: User | null;
  userEmail: string;
  stripeCustomerId: string | null;
};

function BrandMark({ brand }: { brand: string }) {
  const { label, bg, fg } = brandBadge(brand);
  return (
    <View style={[styles.brandMark, { backgroundColor: bg }]}>
      <Text style={[styles.brandMarkTxt, { color: fg }]}>{label}</Text>
    </View>
  );
}

function CardRowInner({
  pm,
  onPressRow,
}: {
  pm: SavedCardPm;
  onPressRow: () => void;
}) {
  const title = `${displayBrandName(pm.brand)} •••• ${pm.last4}`;
  const sub = `Expires ${formatExpiry(pm.expMonth, pm.expYear)}`;

  return (
    <Pressable
      onPress={onPressRow}
      style={({ pressed }) => [styles.pmRow, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
    >
      <BrandMark brand={pm.brand} />
      <View style={styles.pmMid}>
        <View style={styles.titleRow}>
          <Text style={styles.pmTitle} numberOfLines={1}>
            {title}
          </Text>
          {pm.isDefault ? (
            <View style={styles.defaultPill}>
              <Text style={styles.defaultPillTxt}>Default</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.pmSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#C8C6C0" />
    </Pressable>
  );
}

const DEMO_CARD: SavedCardPm = {
  id: 'demo',
  brand: 'visa',
  last4: '4242',
  expMonth: 8,
  expYear: 2027,
  isDefault: true,
};

function ProfilePaymentMethodsDemo() {
  return (
    <View style={styles.card}>
      <View style={styles.pmRow}>
        <BrandMark brand={DEMO_CARD.brand} />
        <View style={styles.pmMid}>
          <View style={styles.titleRow}>
            <Text style={styles.pmTitle}>Visa •••• 4242</Text>
            <View style={styles.defaultPill}>
              <Text style={styles.defaultPillTxt}>Default</Text>
            </View>
          </View>
          <Text style={styles.pmSub}>Expires 08/27 · default</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#C8C6C0" />
      </View>
      <View style={styles.hairline} />
      <Pressable
        style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}
        onPress={() =>
          Alert.alert(
            'Stripe',
            Platform.OS === 'web'
              ? 'Add a card in the iOS or Android app.'
              : 'Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY and run the API server with STRIPE_SECRET_KEY to add cards.'
          )
        }
      >
        <View style={styles.addIconBox}>
          <Ionicons name="add" size={22} color={C.purple} />
        </View>
        <Text style={styles.addTxt}>Add payment method</Text>
      </Pressable>
    </View>
  );
}

function ProfilePaymentMethodsLive({ user, userEmail, stripeCustomerId }: BaseProps) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [localCustomerId, setLocalCustomerId] = useState<string | null>(null);
  const [methods, setMethods] = useState<SavedCardPm[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const customerId = stripeCustomerId ?? localCustomerId;
  const fetchOpts = useMemo(
    () => (user?.uid ? { firebaseUidHeader: user.uid } : undefined),
    [user?.uid]
  );

  const getToken = useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth?.currentUser;
    if (!u) throw new Error('Sign in to manage cards.');
    return u.getIdToken();
  }, []);

  const loadMethods = useCallback(async () => {
    if (!customerId || !user) {
      setMethods([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const { paymentMethods } = await stripeListPaymentMethods(token, customerId, fetchOpts);
      setMethods(paymentMethods);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load cards.';
      Alert.alert('Payment methods', msg);
      setMethods([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, user, getToken, fetchOpts]);

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  const ensureCustomer = useCallback(async (): Promise<string> => {
    if (customerId) return customerId;
    const token = await getToken();
    const { customerId: cid } = await stripeCreateCustomer(token, fetchOpts);
    await saveStripeCustomerId(cid);
    setLocalCustomerId(cid);
    return cid;
  }, [customerId, getToken, fetchOpts]);

  const openAddCard = useCallback(async () => {
    if (!user) {
      Alert.alert('Sign in', 'You need an account to add a payment method.');
      return;
    }
    setBusy(true);
    try {
      const cid = await ensureCustomer();
      const token = await getToken();
      const { customerEphemeralKeySecret, setupIntentClientSecret } = await stripeCreateSetupIntent(
        token,
        cid,
        fetchOpts
      );

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Split',
        customerId: cid,
        customerEphemeralKeySecret,
        setupIntentClientSecret,
        returnURL: 'split://stripe-redirect',
        defaultBillingDetails: userEmail ? { email: userEmail } : undefined,
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        Alert.alert('Could not open card form', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Stripe', presentError.message);
        }
        return;
      }

      await loadMethods();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      Alert.alert('Add card', msg);
    } finally {
      setBusy(false);
    }
  }, [
    user,
    userEmail,
    ensureCustomer,
    getToken,
    fetchOpts,
    initPaymentSheet,
    presentPaymentSheet,
    loadMethods,
  ]);

  const runDetach = useCallback(
    async (pm: SavedCardPm) => {
      if (!customerId || !user) return;
      setBusy(true);
      try {
        const token = await getToken();
        await stripeDetachPaymentMethod(token, customerId, pm.id, fetchOpts);
        await loadMethods();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not remove card.';
        Alert.alert('Remove card', msg);
      } finally {
        setBusy(false);
      }
    },
    [customerId, user, getToken, fetchOpts, loadMethods]
  );

  const confirmRemove = useCallback(
    (pm: SavedCardPm) => {
      Alert.alert(
        'Remove card',
        `Remove ${pm.brand} •••• ${pm.last4} from your account?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => void runDetach(pm) },
        ]
      );
    },
    [runDetach]
  );

  const runSetDefault = useCallback(
    async (pm: SavedCardPm) => {
      if (!customerId || !user) return;
      setBusy(true);
      try {
        const token = await getToken();
        await stripeSetDefaultPaymentMethod(token, customerId, pm.id, fetchOpts);
        await loadMethods();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not update default.';
        Alert.alert('Default card', msg);
      } finally {
        setBusy(false);
      }
    },
    [customerId, user, getToken, fetchOpts, loadMethods]
  );

  const openRowMenu = useCallback(
    (pm: SavedCardPm) => {
      const buttons: {
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress?: () => void;
      }[] = [];

      if (!pm.isDefault) {
        buttons.push({
          text: 'Set as default',
          onPress: () => void runSetDefault(pm),
        });
      }

      buttons.push({
        text: 'Remove card',
        style: 'destructive',
        onPress: () => {
          if (pm.isDefault) {
            Alert.alert(
              'Default card',
              'Set another card as default before removing this one.'
            );
            return;
          }
          confirmRemove(pm);
        },
      });

      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Card options', `${brandBadge(pm.brand).label} •••• ${pm.last4}`, buttons);
    },
    [runSetDefault, confirmRemove]
  );

  const renderSwipeDelete = useCallback(
    (pm: SavedCardPm) => () =>
      (
        <View style={styles.swipeActions}>
          <Pressable
            style={styles.swipeDeleteBtn}
            onPress={() => {
              if (pm.isDefault) {
                Alert.alert(
                  'Default card',
                  'Set another card as default before removing this one.'
                );
                return;
              }
              confirmRemove(pm);
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove card"
          >
            <Text style={styles.swipeDeleteTxt}>Remove</Text>
          </Pressable>
        </View>
      ),
    [confirmRemove]
  );

  return (
    <View style={styles.card}>
      {busy || loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={C.purple} />
        </View>
      ) : null}

      {!loading && methods.length === 0 ? (
        <Text style={styles.emptyHint}>No cards saved yet.</Text>
      ) : null}

      {methods.map((pm) => (
        <View key={pm.id}>
          <Swipeable
            friction={2}
            overshootRight={false}
            renderRightActions={renderSwipeDelete(pm)}
          >
            <CardRowInner pm={pm} onPressRow={() => openRowMenu(pm)} />
          </Swipeable>
          <View style={styles.hairline} />
        </View>
      ))}

      <Pressable
        style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}
        onPress={() => void openAddCard()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Add payment method"
      >
        <View style={styles.addIconBox}>
          <Ionicons name="add" size={22} color={C.purple} />
        </View>
        <Text style={styles.addTxt}>Add payment method</Text>
      </Pressable>
    </View>
  );
}

export default function ProfilePaymentMethodsCard(props: BaseProps) {
  if (Platform.OS === 'web' || !hasStripePublishableKey()) {
    return <ProfilePaymentMethodsDemo />;
  }
  if (!isFirebaseConfigured() || !props.user) {
    return <ProfilePaymentMethodsDemo />;
  }
  return <ProfilePaymentMethodsLive {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  loadingRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: C.muted,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  pmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowPressed: {
    opacity: 0.88,
  },
  brandMark: {
    width: 40,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkTxt: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pmMid: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pmTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    flexShrink: 1,
  },
  pmSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  defaultPill: {
    backgroundColor: C.greenBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  defaultPillTxt: {
    fontSize: 10,
    fontWeight: '600',
    color: C.greenFg,
    textTransform: 'capitalize',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 14,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  addIconBox: {
    width: 40,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.purple,
  },
  swipeActions: {
    justifyContent: 'center',
    backgroundColor: C.red,
    paddingHorizontal: 20,
  },
  swipeDeleteBtn: {
    flex: 1,
    justifyContent: 'center',
  },
  swipeDeleteTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
