import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  allocateCents,
  equalCentsSplit,
  equalIntegerPercents,
  fmtCents,
  normalizeAmountInput,
  ownerLessCentsSplit,
  ownerLessIntegerPercents,
  parseDollarToCents,
  parsePercent,
  percentTotalIsExactly100,
} from '../../lib/addSubscriptionSplitMath';
import { getServiceIconBackgroundColor } from '../components/ServiceIcon';

const C = {
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
  greenTint: '#E1F5EE',
  greenDark: '#0F6E56',
  redTint: '#FCEBEB',
  redDark: '#A32D2D',
  segBg: '#F0EEE9',
  divider: '#F0EEE9',
};

export type SplitMethod = 'equal' | 'customPercent' | 'fixedDollar' | 'ownerLess';

export type WizardMember = {
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  isOwner: boolean;
  /** Not on the app yet — slot reserved until they join and add payment. */
  invitePending?: boolean;
};

const JORDAN: WizardMember = {
  memberId: 'owner-self',
  displayName: 'Jordan (you)',
  initials: 'JD',
  avatarBg: '#EEEDFE',
  avatarColor: '#534AB7',
  isOwner: true,
};

type SheetFriend = Omit<WizardMember, 'isOwner' | 'invitePending'> & {
  mutualSubscriptionsCount: number;
};

const INVITE_URL = 'https://mysplit.app/join';

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : `${w}`.toUpperCase();
  }
  const a = parts[0]![0] ?? '';
  const b = parts[parts.length - 1]![0] ?? '';
  return `${a}${b}`.toUpperCase();
}

const MOCK_FRIENDS: SheetFriend[] = [
  {
    memberId: 'friend-alex',
    displayName: 'Alex L.',
    initials: 'AL',
    avatarBg: '#E1F5EE',
    avatarColor: '#0F6E56',
    mutualSubscriptionsCount: 2,
  },
  {
    memberId: 'friend-sam',
    displayName: 'Sam M.',
    initials: 'SM',
    avatarBg: '#FAECE7',
    avatarColor: '#993C1D',
    mutualSubscriptionsCount: 0,
  },
  {
    memberId: 'friend-taylor',
    displayName: 'Taylor K.',
    initials: 'TK',
    avatarBg: '#E6F1FB',
    avatarColor: '#1a5f8a',
    mutualSubscriptionsCount: 5,
  },
  {
    memberId: 'friend-riley',
    displayName: 'Riley P.',
    initials: 'RP',
    avatarBg: '#E8E4FF',
    avatarColor: '#4338CA',
    mutualSubscriptionsCount: 1,
  },
];

const METHODS: {
  id: SplitMethod;
  name: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'equal', name: 'Equal', desc: 'Split evenly', icon: 'layers-outline' },
  { id: 'customPercent', name: 'Custom %', desc: "Set each person's %", icon: 'pie-chart-outline' },
  { id: 'fixedDollar', name: 'Fixed $', desc: 'Set exact amounts', icon: 'cash-outline' },
  { id: 'ownerLess', name: 'Owner less', desc: 'You pay less', icon: 'person-outline' },
];

function splitMethodToParam(m: SplitMethod): string {
  if (m === 'equal') return 'equal';
  if (m === 'customPercent') return 'custom_percent';
  if (m === 'fixedDollar') return 'fixed_amount';
  return 'owner_less';
}

export default function AddSubscriptionMembersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    serviceName?: string;
    iconColor?: string;
    planName?: string;
    totalCents?: string;
    billingCycle?: string;
    billingDay?: string;
    payerDisplay?: string;
    autoCharge?: string;
  }>();

  const serviceName = typeof params.serviceName === 'string' ? params.serviceName.trim() : '';
  const iconColor =
    serviceName.length > 0
      ? getServiceIconBackgroundColor(serviceName)
      : typeof params.iconColor === 'string'
        ? params.iconColor
        : getServiceIconBackgroundColor('Subscription');
  const planName = typeof params.planName === 'string' ? params.planName.trim() : serviceName;
  const totalCentsRaw = typeof params.totalCents === 'string' ? parseInt(params.totalCents, 10) : NaN;
  const totalCents =
    Number.isFinite(totalCentsRaw) && totalCentsRaw >= 0 ? totalCentsRaw : 0;
  const billingCycle = typeof params.billingCycle === 'string' ? params.billingCycle : 'monthly';
  const billingDay = typeof params.billingDay === 'string' ? params.billingDay : '';
  const payerDisplay = typeof params.payerDisplay === 'string' ? params.payerDisplay : 'Me (owner)';
  const autoCharge = params.autoCharge === '1';

  const [members, setMembers] = useState<WizardMember[]>(() => [JORDAN]);
  const [mode, setMode] = useState<SplitMethod>('equal');
  const [customPercentStr, setCustomPercentStr] = useState<string[]>(() => ['100']);
  const [fixedDollarStr, setFixedDollarStr] = useState<string[]>(() => [
    (totalCents / 100).toFixed(2),
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');

  const n = members.length;

  const equalPercents = useMemo(() => equalIntegerPercents(n), [n]);
  const equalCents = useMemo(() => equalCentsSplit(totalCents, n), [totalCents, n]);
  const ownerLessPercents = useMemo(() => ownerLessIntegerPercents(n), [n]);
  const ownerLessCents = useMemo(() => ownerLessCentsSplit(totalCents, n), [totalCents, n]);

  const customParsed = useMemo(() => customPercentStr.map(parsePercent), [customPercentStr]);
  const customValid = useMemo(() => percentTotalIsExactly100(customParsed), [customParsed]);
  const customSum = useMemo(
    () => customParsed.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
    [customParsed],
  );

  const fixedParsed = useMemo(() => fixedDollarStr.map(parseDollarToCents), [fixedDollarStr]);
  const fixedSumCents = useMemo(
    () => fixedParsed.reduce((a, b) => a + (Number.isFinite(b) && b >= 0 ? b : 0), 0),
    [fixedParsed],
  );
  const fixedValid = useMemo(() => {
    if (fixedParsed.some((v) => !Number.isFinite(v) || v < 0)) return false;
    return fixedSumCents === totalCents;
  }, [fixedParsed, fixedSumCents, totalCents]);

  const rowCents = useMemo(() => {
    if (n === 0) return [];
    if (mode === 'equal') return equalCents;
    if (mode === 'ownerLess') return ownerLessCents;
    if (mode === 'customPercent') {
      if (customParsed.some((v) => !Number.isFinite(v))) {
        return Array.from({ length: n }, () => 0);
      }
      const sum = customParsed.reduce((a, b) => a + b, 0);
      if (sum <= 0) return Array.from({ length: n }, () => 0);
      return allocateCents(totalCents, customParsed);
    }
    return fixedParsed.map((c) => (Number.isFinite(c) && c >= 0 ? c : 0));
  }, [n, mode, equalCents, ownerLessCents, customParsed, totalCents, fixedParsed]);

  const displayPercents = useMemo(() => {
    if (mode === 'equal') return equalPercents;
    if (mode === 'ownerLess') return ownerLessPercents;
    if (mode === 'customPercent') {
      return customParsed.map((p) => (Number.isFinite(p) ? p : 0));
    }
    if (totalCents <= 0) return Array.from({ length: n }, () => 0);
    return rowCents.map((c) => (totalCents > 0 ? (100 * c) / totalCents : 0));
  }, [mode, equalPercents, ownerLessPercents, customParsed, rowCents, totalCents, n]);

  const applyEqual = useCallback(() => {
    setMode('equal');
    setCustomPercentStr(equalIntegerPercents(n).map(String));
    setFixedDollarStr(equalCentsSplit(totalCents, n).map((c) => (c / 100).toFixed(2)));
  }, [n, totalCents]);

  const applyOwnerLess = useCallback(() => {
    setMode('ownerLess');
    setCustomPercentStr(ownerLessIntegerPercents(n).map(String));
    setFixedDollarStr(ownerLessCentsSplit(totalCents, n).map((c) => (c / 100).toFixed(2)));
  }, [n, totalCents]);

  const applyCustom = useCallback(() => {
    if (mode === 'fixedDollar') {
      const cents = fixedDollarStr.map(parseDollarToCents);
      if (cents.every((c) => Number.isFinite(c) && c >= 0)) {
        const sum = cents.reduce((a, b) => a + b, 0);
        if (sum > 0) {
          const p = cents.map((c) => (100 * c) / sum);
          setCustomPercentStr(p.map((x) => String(Math.round(x * 100) / 100)));
        } else {
          setCustomPercentStr(equalIntegerPercents(n).map(String));
        }
      } else {
        setCustomPercentStr(equalIntegerPercents(n).map(String));
      }
    } else if (mode === 'ownerLess') {
      setCustomPercentStr(ownerLessIntegerPercents(n).map(String));
    } else {
      setCustomPercentStr(equalIntegerPercents(n).map(String));
    }
    setMode('customPercent');
  }, [mode, fixedDollarStr, n]);

  const applyFixed = useCallback(() => {
    let cents: number[];
    if (mode === 'equal') {
      cents = equalCentsSplit(totalCents, n);
    } else if (mode === 'ownerLess') {
      cents = ownerLessCentsSplit(totalCents, n);
    } else if (mode === 'customPercent') {
      const p = customPercentStr.map(parsePercent);
      if (p.every(Number.isFinite) && percentTotalIsExactly100(p)) {
        cents = allocateCents(totalCents, p);
      } else {
        const sum = p.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        cents = sum > 0 ? allocateCents(totalCents, p) : equalCentsSplit(totalCents, n);
      }
    } else {
      cents = fixedDollarStr.map(parseDollarToCents);
      if (!cents.every((c) => Number.isFinite(c) && c >= 0)) {
        cents = equalCentsSplit(totalCents, n);
      }
    }
    setFixedDollarStr(cents.map((c) => (c / 100).toFixed(2)));
    setMode('fixedDollar');
  }, [mode, totalCents, n, customPercentStr, fixedDollarStr]);

  const onSelectMethod = (id: SplitMethod) => {
    if (id === 'equal') applyEqual();
    else if (id === 'ownerLess') applyOwnerLess();
    else if (id === 'customPercent') applyCustom();
    else applyFixed();
  };

  const setPercentAt = (i: number, text: string) => {
    setCustomPercentStr((prev) => {
      const next = [...prev];
      next[i] = text;
      return next;
    });
  };

  const setDollarAt = (i: number, text: string) => {
    setFixedDollarStr((prev) => {
      const next = [...prev];
      next[i] = normalizeAmountInput(text);
      return next;
    });
  };

  const appendMemberCore = useCallback(
    (newMember: WizardMember): boolean => {
      let added = false;
      let newN = 0;
      setMembers((prev) => {
        if (prev.some((m) => m.memberId === newMember.memberId)) return prev;
        added = true;
        const next = [...prev, newMember];
        newN = next.length;
        return next;
      });
      if (!added) return false;
      if (mode === 'equal') {
        setCustomPercentStr(equalIntegerPercents(newN).map(String));
        setFixedDollarStr(equalCentsSplit(totalCents, newN).map((c) => (c / 100).toFixed(2)));
      } else if (mode === 'ownerLess') {
        setCustomPercentStr(ownerLessIntegerPercents(newN).map(String));
        setFixedDollarStr(ownerLessCentsSplit(totalCents, newN).map((c) => (c / 100).toFixed(2)));
      } else if (mode === 'customPercent') {
        setCustomPercentStr((p) => [...p, '0']);
        setFixedDollarStr(equalCentsSplit(totalCents, newN).map((c) => (c / 100).toFixed(2)));
      } else {
        setFixedDollarStr((p) => [...p, '0.00']);
        setCustomPercentStr(equalIntegerPercents(newN).map(String));
      }
      return true;
    },
    [mode, totalCents],
  );

  const shareAppInvite = useCallback(async () => {
    try {
      await Share.share({
        message:
          Platform.OS === 'ios'
            ? `Join me on mySplit — split subscriptions together.`
            : `Join me on mySplit — split subscriptions together.\n${INVITE_URL}`,
      });
    } catch {
      /* dismissed */
    }
  }, []);

  const shareNamedInvite = useCallback(async (name: string) => {
    try {
      await Share.share({
        message:
          Platform.OS === 'ios'
            ? `I'm inviting ${name} to split subscriptions with me on mySplit.`
            : `I'm inviting ${name} to split subscriptions with me on mySplit.\n${INVITE_URL}`,
      });
    } catch {
      /* dismissed */
    }
  }, []);

  const onPickFriend = useCallback(
    (friend: SheetFriend) => {
      if (members.some((m) => m.memberId === friend.memberId)) {
        setPickerOpen(false);
        setFriendQuery('');
        return;
      }
      const ok = appendMemberCore({
        memberId: friend.memberId,
        displayName: friend.displayName,
        initials: friend.initials,
        avatarBg: friend.avatarBg,
        avatarColor: friend.avatarColor,
        isOwner: false,
      });
      if (ok) {
        setPickerOpen(false);
        setFriendQuery('');
      }
    },
    [members, appendMemberCore],
  );

  const inviteSearchNameToSplit = useCallback(
    (name: string) => {
      const trim = name.trim();
      if (!trim) return;
      const ok = appendMemberCore({
        memberId: `pending-invite-${Date.now()}`,
        displayName: trim,
        initials: deriveInitials(trim),
        avatarBg: C.purpleTint,
        avatarColor: C.purple,
        isOwner: false,
        invitePending: true,
      });
      if (ok) void shareNamedInvite(trim);
      setPickerOpen(false);
      setFriendQuery('');
    },
    [appendMemberCore, shareNamedInvite],
  );

  const validationBarVisible = mode === 'customPercent';
  const canContinue =
    totalCents > 0 &&
    n >= 1 &&
    (mode === 'equal' || mode === 'ownerLess'
      ? true
      : mode === 'customPercent'
        ? customValid
        : fixedValid);

  const onReview = () => {
    if (!canContinue) return;
    const reviewMembers = members.map((m, i) => ({
      memberId: m.memberId,
      displayName: m.displayName,
      initials: m.initials,
      avatarBg: m.avatarBg,
      avatarColor: m.avatarColor,
      role: m.isOwner ? ('owner' as const) : ('member' as const),
      percent: displayPercents[i] ?? 0,
      amountCents: rowCents[i] ?? 0,
      invitePending: m.invitePending === true,
    }));
    const payload = encodeURIComponent(JSON.stringify({ members: reviewMembers }));
    router.push({
      pathname: '/add-subscription/review',
      params: {
        serviceName,
        iconColor,
        planName,
        totalCents: String(totalCents),
        billingCycle,
        billingDay,
        payerDisplay,
        autoCharge: autoCharge ? '1' : '0',
        splitMethod: splitMethodToParam(mode),
        membersReviewJson: payload,
      },
    });
  };

  const friendsForSheet = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    return MOCK_FRIENDS.filter(
      (f) => q === '' || f.displayName.toLowerCase().includes(q),
    );
  }, [friendQuery]);

  const addedMemberIds = useMemo(() => new Set(members.map((m) => m.memberId)), [members]);

  const inputLocked = mode === 'equal' || mode === 'ownerLess';

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
          accessibilityLabel="Back to plan details"
        >
          <Ionicons name="chevron-back" size={26} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backLbl}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Who's splitting?</Text>
        <Text style={styles.sub}>Add members and set their share</Text>
        <View style={styles.progWrap}>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: '75%' }]} />
          </View>
          <Text style={styles.progLabel}>Step 3 of 4</Text>
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
        <Text style={styles.sectionLbl}>Split method</Text>
        <View style={styles.methodGrid}>
          {METHODS.map((m) => {
            const on = mode === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => onSelectMethod(m.id)}
                style={[styles.methodCard, on && styles.methodCardOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.methodIco, on ? styles.methodIcoOn : styles.methodIcoOff]}>
                  <Ionicons name={m.icon} size={18} color={on ? C.purple : '#5F5E5A'} />
                </View>
                <Text style={[styles.methodName, on && styles.methodNameOn]}>{m.name}</Text>
                <Text style={styles.methodDesc}>{m.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLbl, styles.sectionSpaced]}>Members</Text>
        <View style={styles.memberCard}>
          {members.map((m, i) => {
            const isLast = i === members.length - 1;
            let inputInner: ReactNode;
            if (inputLocked) {
              const p = displayPercents[i] ?? 0;
              inputInner = (
                <Text style={styles.inputLockedTxt}>
                  {Number.isInteger(p) || Math.abs(p - Math.round(p)) < 1e-6
                    ? `${Math.round(p)}%`
                    : `${p.toFixed(1)}%`}
                </Text>
              );
            } else if (mode === 'customPercent') {
              inputInner = (
                <TextInput
                  value={customPercentStr[i] ?? ''}
                  onChangeText={(t) => setPercentAt(i, t)}
                  keyboardType="decimal-pad"
                  style={styles.inputEditable}
                  placeholder="0"
                  placeholderTextColor={C.muted}
                  accessibilityLabel={`${m.displayName} percent share`}
                />
              );
            } else {
              inputInner = (
                <View style={styles.dollarInputRow}>
                  <Text style={styles.dollarTiny}>$</Text>
                  <TextInput
                    value={fixedDollarStr[i] ?? ''}
                    onChangeText={(t) => setDollarAt(i, t)}
                    keyboardType="decimal-pad"
                    style={styles.inputEditableDollar}
                    placeholder="0.00"
                    placeholderTextColor={C.muted}
                    accessibilityLabel={`${m.displayName} fixed amount`}
                  />
                </View>
              );
            }

            return (
              <View key={m.memberId} style={[styles.memberRow, isLast && styles.memberRowLast]}>
                <View style={[styles.memberAv, { backgroundColor: m.avatarBg }]}>
                  <Text style={[styles.memberAvTxt, { color: m.avatarColor }]}>{m.initials}</Text>
                </View>
                <View style={styles.memberMeta}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  <Text style={styles.memberRole}>
                    {m.isOwner
                      ? 'Owner · pays subscription'
                      : m.invitePending
                        ? 'Invited · pending'
                        : 'Member'}
                  </Text>
                </View>
                <View style={[styles.inputShell, inputLocked && styles.inputShellLocked]}>
                  {inputInner}
                </View>
                <Text style={styles.amtLabel} numberOfLines={1}>
                  {fmtCents(rowCents[i] ?? 0)}
                </Text>
              </View>
            );
          })}
        </View>

        {validationBarVisible ? (
          <View style={[styles.validationBar, customValid ? styles.validationOk : styles.validationBad]}>
            {customValid ? (
              <>
                <Text style={[styles.valTxt, styles.valTxtOk, styles.valTxtGrow]}>Total: 100% ✓</Text>
                <Text style={[styles.valTxt, styles.valTxtOk, styles.valTxtRight]}>
                  {fmtCents(totalCents)} ✓
                </Text>
              </>
            ) : (
              <Text
                style={[styles.valTxt, styles.valTxtBad, styles.valTxtFull]}
                numberOfLines={3}
              >
                {`Total: ${Number.isFinite(customSum) ? `${customSum.toFixed(2).replace(/\.?0+$/, '')}%` : '—'} — must equal 100%`}
              </Text>
            )}
          </View>
        ) : null}

        <Pressable
          onPress={() => setPickerOpen(true)}
          style={styles.addMemberBtn}
          accessibilityRole="button"
          accessibilityLabel="Add member"
        >
          <Text style={styles.addMemberBtnTxt}>+ Add member</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={onReview}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.primaryBtn,
            !canContinue && styles.primaryBtnDisabled,
            pressed && canContinue && styles.primaryBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
        >
          <Text style={styles.primaryBtnTxt}>Review split</Text>
        </Pressable>
      </View>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <TextInput
              value={friendQuery}
              onChangeText={setFriendQuery}
              placeholder="Search friends…"
              placeholderTextColor={C.muted}
              style={styles.sheetSearch}
              accessibilityLabel="Search friends"
            />
            <Text style={styles.sheetSectionLbl}>Your friends</Text>
            <FlatList
              data={friendsForSheet}
              keyExtractor={(item) => item.memberId}
              style={styles.sheetList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                friendQuery.trim() ? (
                  <Pressable
                    style={styles.sheetEmptyInvite}
                    onPress={() => inviteSearchNameToSplit(friendQuery.trim())}
                    accessibilityRole="button"
                    accessibilityLabel={`No friends found, invite ${friendQuery.trim()} to mySplit`}
                  >
                    <Text style={styles.sheetEmptyInviteTxt}>
                      No friends found · Invite {friendQuery.trim()} to mySplit
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.sheetEmpty}>No friends yet.</Text>
                )
              }
              renderItem={({ item }) => {
                const added = addedMemberIds.has(item.memberId);
                return (
                  <Pressable
                    style={styles.friendRow}
                    onPress={() => onPickFriend(item)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      added ? `${item.displayName}, already added` : `Add ${item.displayName}`
                    }
                  >
                    <View style={styles.sheetAvatarWrap}>
                      <View style={[styles.memberAv, { backgroundColor: item.avatarBg }]}>
                        <Text style={[styles.memberAvTxt, { color: item.avatarColor }]}>
                          {item.initials}
                        </Text>
                      </View>
                      {added ? (
                        <View style={styles.sheetAddedBadge} accessibilityLabel="Added to split">
                          <Ionicons name="checkmark" size={11} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.friendMeta}>
                      <Text style={styles.friendName} numberOfLines={1}>
                        {item.displayName}
                      </Text>
                      <Text style={styles.friendMutual} numberOfLines={1}>
                        {item.mutualSubscriptionsCount === 0
                          ? 'No mutual subscriptions'
                          : item.mutualSubscriptionsCount === 1
                            ? '1 mutual subscription'
                            : `${item.mutualSubscriptionsCount} mutual subscriptions`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.muted} />
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.sheetInviteRow}
              onPress={() => void shareAppInvite()}
              accessibilityRole="button"
              accessibilityLabel="Invite to mySplit, share link"
            >
              <View style={styles.sheetInviteIco}>
                <Ionicons name="share-outline" size={20} color={C.purple} />
              </View>
              <View style={styles.sheetInviteCopy}>
                <Text style={styles.sheetInviteTitle}>Invite to mySplit</Text>
                <Text style={styles.sheetInviteSub}>Share an invite link</Text>
              </View>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingBottom: 24,
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
    marginBottom: 10,
  },
  sectionSpaced: {
    marginTop: 20,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  methodCardOn: {
    borderWidth: 2,
    borderColor: C.purple,
    backgroundColor: C.purpleTint,
  },
  methodIco: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  methodIcoOn: {
    backgroundColor: '#fff',
  },
  methodIcoOff: {
    backgroundColor: C.segBg,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  methodNameOn: {
    color: C.purple,
  },
  methodDesc: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
    textAlign: 'center',
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  memberRowLast: {
    borderBottomWidth: 0,
  },
  memberAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  memberMeta: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  memberRole: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  inputShell: {
    width: 72,
    backgroundColor: C.segBg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    minHeight: 40,
  },
  inputShellLocked: {
    opacity: 0.95,
  },
  inputLockedTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.purple,
    textAlign: 'center',
  },
  inputEditable: {
    fontSize: 15,
    fontWeight: '600',
    color: C.purple,
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  dollarInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dollarTiny: {
    fontSize: 13,
    fontWeight: '600',
    color: C.purple,
  },
  inputEditableDollar: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: C.purple,
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  amtLabel: {
    width: 56,
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    textAlign: 'right',
  },
  validationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  validationOk: {
    backgroundColor: C.greenTint,
  },
  validationBad: {
    backgroundColor: C.redTint,
  },
  valTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  valTxtFull: {
    flex: 1,
  },
  valTxtGrow: {
    flex: 1,
  },
  valTxtRight: {
    textAlign: 'right',
  },
  valTxtOk: {
    color: C.greenDark,
  },
  valTxtBad: {
    color: C.redDark,
  },
  addMemberBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D3D1C7',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  addMemberBtnTxt: {
    fontSize: 16,
    fontWeight: '500',
    color: C.purple,
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '88%',
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D3D1C7',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetSearch: {
    backgroundColor: C.segBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
    marginBottom: 12,
  },
  sheetSectionLbl: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sheetList: {
    maxHeight: 320,
  },
  sheetEmpty: {
    fontSize: 15,
    color: C.muted,
    paddingVertical: 20,
    textAlign: 'center',
  },
  sheetEmptyInvite: {
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  sheetEmptyInviteTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.purple,
    textAlign: 'center',
    lineHeight: 22,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  sheetAvatarWrap: {
    position: 'relative',
  },
  sheetAddedBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.purple,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendMeta: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  friendMutual: {
    fontSize: 12,
    color: C.muted,
    marginTop: 3,
  },
  sheetInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.divider,
  },
  sheetInviteIco: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetInviteCopy: {
    flex: 1,
  },
  sheetInviteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  sheetInviteSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
});
