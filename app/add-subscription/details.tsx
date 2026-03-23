import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { getServiceIconBackgroundColor } from '../components/ServiceIcon';

const C = {
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
  fieldBorder: 'rgba(0,0,0,0.08)',
  segBg: '#F0EEE9',
  greenTint: '#E1F5EE',
  greenDark: '#0F6E56',
  warnText: '#993C1D',
};

type BillingCycle = 'monthly' | 'yearly';

function normalizeAmountInput(raw: string): string {
  let t = raw.replace(/[^\d.]/g, '');
  const dot = t.indexOf('.');
  if (dot !== -1) {
    const intPart = t.slice(0, dot + 1);
    const dec = t.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    t = intPart + dec;
  }
  return t;
}

function parseMoneyToCents(s: string): number | null {
  const cleaned = s.trim();
  if (cleaned === '' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export default function AddSubscriptionDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    serviceName,
    iconColor,
    priceSuggestionCents,
    planName: planNameParam,
    totalCents: totalCentsParam,
    billingCycle: billingCycleParam,
    billingDay: billingDayParam,
    autoCharge: autoChargeParam,
  } = useLocalSearchParams<{
    serviceName?: string;
    iconColor?: string;
    priceSuggestionCents?: string;
    planName?: string;
    totalCents?: string;
    billingCycle?: string;
    billingDay?: string;
    autoCharge?: string;
  }>();

  const baseServiceName = typeof serviceName === 'string' ? serviceName.trim() : '';
  const iconTint =
    baseServiceName.length > 0
      ? getServiceIconBackgroundColor(baseServiceName)
      : typeof iconColor === 'string'
        ? iconColor
        : getServiceIconBackgroundColor('Subscription');
  const suggestedCentsRaw =
    typeof priceSuggestionCents === 'string' && priceSuggestionCents !== ''
      ? parseInt(priceSuggestionCents, 10)
      : NaN;
  const suggestedCents =
    Number.isFinite(suggestedCentsRaw) && suggestedCentsRaw >= 0 ? suggestedCentsRaw : null;

  const prefillTotalParsed =
    typeof totalCentsParam === 'string' && totalCentsParam !== ''
      ? parseInt(totalCentsParam, 10)
      : NaN;
  const prefillTotalCents =
    Number.isFinite(prefillTotalParsed) && prefillTotalParsed > 0 ? prefillTotalParsed : null;

  const prefillPlan =
    typeof planNameParam === 'string' && planNameParam.trim() !== '' ? planNameParam.trim() : '';

  const [planName, setPlanName] = useState(() => prefillPlan || baseServiceName);
  const [amountText, setAmountText] = useState(() => {
    if (prefillTotalCents !== null) return (prefillTotalCents / 100).toFixed(2);
    if (suggestedCents !== null) return (suggestedCents / 100).toFixed(2);
    return '';
  });
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(() =>
    billingCycleParam === 'yearly' ? 'yearly' : 'monthly',
  );
  const [billingDay, setBillingDay] = useState(() =>
    typeof billingDayParam === 'string' ? billingDayParam : '',
  );
  const [payerDisplay] = useState('Me (owner)');
  const [autoCharge, setAutoCharge] = useState(() => autoChargeParam !== '0');
  const [costFocused, setCostFocused] = useState(false);
  const [costError, setCostError] = useState('');
  const costInputRef = useRef<TextInput>(null);

  const hasPrefill = prefillTotalCents !== null || suggestedCents !== null;
  useEffect(() => {
    if (!hasPrefill) {
      const t = setTimeout(() => costInputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, []);

  const onAmountChange = useCallback((t: string) => {
    setAmountText(normalizeAmountInput(t));
    if (t) setCostError('');
  }, []);

  const onAmountBlur = useCallback(() => {
    setCostFocused(false);
    if (amountText.trim() !== '') {
      const n = parseFloat(amountText);
      if (Number.isFinite(n) && n > 0) {
        setAmountText(n.toFixed(2));
      }
    }
  }, [amountText]);

  const totalCents = useMemo(() => parseMoneyToCents(amountText), [amountText]);
  const billingDayOk = billingDay.trim().length > 0;

  const headerTitle = baseServiceName ? `${baseServiceName} details` : 'Subscription details';

  const onContinue = useCallback(() => {
    if (totalCents === null) {
      setCostError('Please enter the total cost');
      costInputRef.current?.focus();
      return;
    }
    if (!billingDayOk) return;
    router.push({
      pathname: '/add-subscription/members',
      params: {
        serviceName: baseServiceName,
        iconColor: iconTint,
        planName: planName.trim() || baseServiceName,
        totalCents: String(totalCents),
        billingCycle,
        billingDay: billingDay.trim(),
        payerDisplay,
        autoCharge: autoCharge ? '1' : '0',
      },
    });
  }, [
    totalCents,
    billingDayOk,
    router,
    baseServiceName,
    iconTint,
    planName,
    billingCycle,
    billingDay,
    payerDisplay,
    autoCharge,
  ]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#6B3FA0', '#4A1570', '#2D0D45']}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4 }]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back to choose service"
        >
          <Ionicons name="chevron-back" size={26} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backLbl}>Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={2}>
          {headerTitle}
        </Text>
        <Text style={styles.sub}>Enter your plan cost and billing date</Text>
        <View style={styles.progWrap}>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: '50%' }]} />
          </View>
          <Text style={styles.progLabel}>Step 2 of 4</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(insets.bottom, 16) + 96 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLbl}>Plan details</Text>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Plan name</Text>
          <TextInput
            value={planName}
            onChangeText={setPlanName}
            placeholder="e.g. Netflix Premium"
            placeholderTextColor={C.muted}
            style={styles.fieldInput}
            accessibilityLabel="Plan name"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Total cost</Text>
          <View
            style={[
              styles.costRow,
              costFocused && styles.costRowFocused,
            ]}
          >
            <Text style={styles.dollarPrefix}>$</Text>
            <TextInput
              ref={costInputRef}
              value={amountText}
              onChangeText={onAmountChange}
              placeholder="0.00"
              placeholderTextColor={C.muted}
              keyboardType={Platform.OS === 'android' ? 'numeric' : 'decimal-pad'}
              onFocus={() => { setCostFocused(true); setCostError(''); }}
              onBlur={onAmountBlur}
              style={styles.costInput}
              accessibilityLabel="Total cost"
            />
          </View>
          {costError ? <Text style={styles.fieldError}>{costError}</Text> : null}
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Billing cycle</Text>
          <View style={styles.seg}>
            <Pressable
              onPress={() => setBillingCycle('monthly')}
              style={[styles.segBtn, billingCycle === 'monthly' && styles.segBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: billingCycle === 'monthly' }}
            >
              <Text style={[styles.segTxt, billingCycle === 'monthly' && styles.segTxtOn]}>
                Monthly
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBillingCycle('yearly')}
              style={[styles.segBtn, billingCycle === 'yearly' && styles.segBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: billingCycle === 'yearly' }}
            >
              <Text style={[styles.segTxt, billingCycle === 'yearly' && styles.segTxtOn]}>
                Yearly
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.row2}>
          <View style={[styles.fieldWrap, styles.row2Item]}>
            <Text style={styles.fieldLabel}>Billing day</Text>
            <TextInput
              value={billingDay}
              onChangeText={setBillingDay}
              placeholder="e.g. 18th"
              placeholderTextColor={C.muted}
              style={styles.fieldInput}
              accessibilityLabel="Billing day of month"
            />
          </View>
          <View style={[styles.fieldWrap, styles.row2Item]}>
            <Text style={styles.fieldLabel}>Who pays?</Text>
            <View style={styles.readonlyField}>
              <Text style={styles.readonlyFieldTxt}>{payerDisplay}</Text>
            </View>
          </View>
        </View>

        <View style={styles.autoCard}>
          <View style={styles.atIcon}>
            <Ionicons name="checkmark" size={20} color={C.greenDark} />
          </View>
          <View style={styles.atContent}>
            <Text style={styles.atTitle}>Auto-charge members</Text>
            <Text style={styles.atSub}>Stripe charges on billing day automatically</Text>
          </View>
          <Switch
            value={autoCharge}
            onValueChange={setAutoCharge}
            trackColor={{ false: '#D3D1C7', true: C.purple }}
            thumbColor="#fff"
            ios_backgroundColor="#D3D1C7"
            accessibilityLabel="Auto-charge members"
          />
        </View>

        {!autoCharge ? (
          <Text style={styles.warnInline}>
            You will need to manually request payment each cycle
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={onContinue}
          disabled={!billingDayOk}
          style={({ pressed }) => [
            styles.primaryBtn,
            !billingDayOk && styles.primaryBtnDisabled,
            pressed && billingDayOk && styles.primaryBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !billingDayOk }}
        >
          <Text style={styles.primaryBtnTxt}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 26,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backLbl: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  title: {
    fontSize: 23,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  progWrap: {
    marginTop: 16,
  },
  progTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  progLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  sectionLbl: {
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  fieldWrap: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    color: C.muted,
    marginBottom: 6,
  },
  fieldInput: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.fieldBorder,
    borderRadius: 12,
    fontSize: 18,
    color: C.text,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.fieldBorder,
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 10,
  },
  costRowFocused: {
    borderColor: C.purple,
    borderWidth: 1.5,
  },
  dollarPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
    marginRight: 2,
  },
  costInput: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 4,
    fontSize: 18,
    color: C.text,
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: C.segBg,
    borderRadius: 10,
    padding: 3,
    gap: 0,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  segBtnOn: {
    backgroundColor: '#fff',
  },
  segTxt: {
    fontSize: 15,
    fontWeight: '500',
    color: C.muted,
  },
  segTxtOn: {
    color: C.purple,
  },
  row2: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  row2Item: {
    flex: 1,
    marginBottom: 0,
  },
  readonlyField: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.fieldBorder,
    borderRadius: 12,
    justifyContent: 'center',
  },
  readonlyFieldTxt: {
    fontSize: 18,
    color: C.text,
  },
  autoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    marginTop: 20,
  },
  atIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atContent: {
    flex: 1,
  },
  atTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
  },
  atSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
    lineHeight: 18,
  },
  fieldError: {
    fontSize: 13,
    color: C.warnText,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  warnInline: {
    fontSize: 14,
    color: C.warnText,
    marginTop: 14,
    lineHeight: 20,
    paddingHorizontal: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.38,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnTxt: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
