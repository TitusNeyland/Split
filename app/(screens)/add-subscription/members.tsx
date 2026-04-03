import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Keyboard,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { onAuthStateChanged, type User } from 'firebase/auth';
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
} from '../../../lib/subscription/addSubscriptionSplitMath';
import { getServiceIconBackgroundColor } from '../../components/shared/ServiceIcon';
import { UserAvatarCircle } from '../../components/shared/UserAvatarCircle';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import { searchUsersForFriendConnect, type FriendSearchUserRow } from '../../../lib/friends/userSearchFirestore';
import { getFriendAvatarColors } from '../../../lib/friends/friendAvatar';
import { initialsFromName } from '../../../lib/profile';
import { useProfileAvatarUrl } from '../../hooks/useProfileAvatarUrl';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

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
  /** From friend search / profile; owner row uses live profile URL in UI. */
  avatarUrl?: string | null;
  isOwner: boolean;
  /** Not on the app yet — slot reserved until they join and add payment. */
  invitePending?: boolean;
  /** Set when the invite was created from an email-shaped search query. */
  pendingInviteEmail?: string;
};

/** Owner row for the wizard; Firestore uses `persistMemberId` → real uid at create time. */
function buildOwnerMember(displayNameFromProfile: string | null, user: User | null): WizardMember {
  const raw =
    (displayNameFromProfile && displayNameFromProfile.trim()) ||
    user?.displayName?.trim() ||
    user?.email?.split('@')[0]?.trim() ||
    'You';
  const first = raw.split(/\s+/)[0] || 'You';
  return {
    memberId: 'owner-self',
    displayName: `${first} (you)`,
    initials: initialsFromName(first),
    avatarBg: '#EEEDFE',
    avatarColor: '#534AB7',
    isOwner: true,
  };
}

type SheetFriend = Omit<WizardMember, 'isOwner' | 'invitePending'> & {
  mutualSubscriptionsCount: number;
  avatarUrl?: string | null;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function friendSearchRowToSheetFriend(row: FriendSearchUserRow): SheetFriend {
  const { backgroundColor, color } = getFriendAvatarColors(row.uid);
  return {
    memberId: row.uid,
    displayName: row.displayName,
    initials: initialsFromName(row.displayName),
    avatarBg: backgroundColor,
    avatarColor: color,
    mutualSubscriptionsCount: 0,
    avatarUrl: row.avatarUrl,
  };
}

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
    serviceId?: string;
    iconColor?: string;
    planName?: string;
    totalCents?: string;
    billingCycle?: string;
    billingDay?: string;
    payerDisplay?: string;
    autoCharge?: string;
  }>();

  const serviceName = typeof params.serviceName === 'string' ? params.serviceName.trim() : '';
  const serviceIdParam = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const iconColor =
    typeof params.iconColor === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(params.iconColor.trim())
      ? params.iconColor.trim()
      : serviceName.length > 0
        ? getServiceIconBackgroundColor(serviceName)
        : getServiceIconBackgroundColor('Subscription');
  const planName = typeof params.planName === 'string' ? params.planName.trim() : serviceName;
  const totalCentsRaw = typeof params.totalCents === 'string' ? parseInt(params.totalCents, 10) : NaN;
  const totalCents =
    Number.isFinite(totalCentsRaw) && totalCentsRaw >= 0 ? totalCentsRaw : 0;
  const billingCycle = typeof params.billingCycle === 'string' ? params.billingCycle : 'monthly';
  const billingDay = typeof params.billingDay === 'string' ? params.billingDay : '';
  const payerDisplay = typeof params.payerDisplay === 'string' ? params.payerDisplay : 'Me (owner)';
  const autoCharge = params.autoCharge === '1';

  const { displayName: profileDisplayName, avatarUrl: profileAvatarUrl } = useProfileAvatarUrl();

  const [members, setMembers] = useState<WizardMember[]>(() => [
    buildOwnerMember(null, getFirebaseAuth()?.currentUser ?? null),
  ]);
  const [mode, setMode] = useState<SplitMethod>('equal');
  const [customPercentStr, setCustomPercentStr] = useState<string[]>(() => ['100']);
  const [fixedDollarStr, setFixedDollarStr] = useState<string[]>(() => [
    (totalCents / 100).toFixed(2),
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Non-owner members added while the Add Members sheet is open (order preserved). */
  const [sheetSessionAddedIds, setSheetSessionAddedIds] = useState<string[]>([]);
  const [friendQuery, setFriendQuery] = useState('');
  const [searchUser, setSearchUser] = useState<User | null>(() => getFirebaseAuth()?.currentUser ?? null);
  const debouncedFriendQuery = useDebouncedValue(friendQuery, 300);
  const [searchResults, setSearchResults] = useState<FriendSearchUserRow[]>([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const searchReq = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollContentRef = useRef<View>(null);
  const memberInputRefs = useRef<(TextInput | null)[]>([]);
  const sheetSearchInputRef = useRef<TextInput>(null);
  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setSearchUser);
  }, []);

  useEffect(() => {
    setMembers((prev) => {
      const idx = prev.findIndex((m) => m.isOwner && m.memberId === 'owner-self');
      if (idx < 0) return prev;
      const newOwner = buildOwnerMember(profileDisplayName, searchUser);
      const old = prev[idx];
      if (old.displayName === newOwner.displayName && old.initials === newOwner.initials) return prev;
      const next = [...prev];
      next[idx] = newOwner;
      return next;
    });
  }, [profileDisplayName, searchUser]);

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
    if (keyboardHeight > 0) Keyboard.dismiss();
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

  const removeMemberCore = useCallback(
    (memberId: string) => {
      let removed = false;
      let removedIndex = -1;
      let newN = 0;
      setMembers((prev) => {
        const idx = prev.findIndex((m) => m.memberId === memberId && !m.isOwner);
        if (idx < 0) return prev;
        removed = true;
        removedIndex = idx;
        const next = prev.filter((m) => m.memberId !== memberId);
        newN = next.length;
        return next;
      });
      if (!removed) return;

      if (mode === 'equal') {
        setCustomPercentStr(equalIntegerPercents(newN).map(String));
        setFixedDollarStr(equalCentsSplit(totalCents, newN).map((c) => (c / 100).toFixed(2)));
      } else if (mode === 'ownerLess') {
        setCustomPercentStr(ownerLessIntegerPercents(newN).map(String));
        setFixedDollarStr(ownerLessCentsSplit(totalCents, newN).map((c) => (c / 100).toFixed(2)));
      } else if (mode === 'customPercent') {
        setCustomPercentStr((p) => {
          const np = [...p];
          if (removedIndex >= 0 && removedIndex < np.length) np.splice(removedIndex, 1);
          return np.length >= 1 ? np : ['100'];
        });
        setFixedDollarStr(equalCentsSplit(totalCents, newN).map((c) => (c / 100).toFixed(2)));
      } else {
        setFixedDollarStr((p) => {
          const np = [...p];
          if (removedIndex >= 0 && removedIndex < np.length) np.splice(removedIndex, 1);
          if (np.length === 0) return [(totalCents / 100).toFixed(2)];
          return np;
        });
        setCustomPercentStr(equalIntegerPercents(newN).map(String));
      }
    },
    [mode, totalCents],
  );

  const removeNonOwnerMember = useCallback(
    (memberId: string) => {
      removeMemberCore(memberId);
      setSheetSessionAddedIds((prev) => prev.filter((id) => id !== memberId));
    },
    [removeMemberCore],
  );

  const onToggleFriendInSplit = useCallback(
    (friend: SheetFriend) => {
      const isOnSplit = members.some((m) => m.memberId === friend.memberId);
      if (isOnSplit) {
        removeNonOwnerMember(friend.memberId);
        return;
      }
      const ok = appendMemberCore({
        memberId: friend.memberId,
        displayName: friend.displayName,
        initials: friend.initials,
        avatarBg: friend.avatarBg,
        avatarColor: friend.avatarColor,
        avatarUrl: friend.avatarUrl ?? null,
        isOwner: false,
      });
      if (ok) {
        setSheetSessionAddedIds((prev) =>
          prev.includes(friend.memberId) ? prev : [...prev, friend.memberId],
        );
        setFriendQuery('');
        setTimeout(() => sheetSearchInputRef.current?.focus(), 0);
      }
    },
    [members, appendMemberCore, removeNonOwnerMember],
  );

  const closeMemberPicker = useCallback(() => {
    Keyboard.dismiss();
    setPickerOpen(false);
    setFriendQuery('');
  }, []);

  const searchUid = searchUser?.uid ?? null;

  useEffect(() => {
    const q = debouncedFriendQuery.trim();
    if (q.length < 3 || !searchUid || !isFirebaseConfigured()) {
      setSearchResults([]);
      setSearchingFriends(false);
      return;
    }

    const id = ++searchReq.current;
    setSearchingFriends(true);

    void searchUsersForFriendConnect({ currentUid: searchUid, searchText: q })
      .then((rows) => {
        if (searchReq.current !== id) return;
        setSearchResults(rows);
      })
      .catch(() => {
        if (searchReq.current !== id) return;
        setSearchResults([]);
      })
      .finally(() => {
        if (searchReq.current !== id) return;
        setSearchingFriends(false);
      });
  }, [debouncedFriendQuery, searchUid]);

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
      avatarUrl: m.avatarUrl ?? null,
      role: m.isOwner ? ('owner' as const) : ('member' as const),
      percent: displayPercents[i] ?? 0,
      amountCents: rowCents[i] ?? 0,
      invitePending: m.invitePending === true,
      pendingInviteEmail: m.pendingInviteEmail,
    }));
    const payload = encodeURIComponent(JSON.stringify({ members: reviewMembers }));
    router.push({
      pathname: '/add-subscription/review',
      params: {
        serviceName,
        ...(serviceIdParam ? { serviceId: serviceIdParam } : {}),
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

  const friendsForSheet = useMemo(
    () => searchResults.map(friendSearchRowToSheetFriend),
    [searchResults],
  );

  const showSearchEmptyState =
    friendQuery.trim().length >= 3 && !searchingFriends && friendsForSheet.length === 0;

  const addedMemberIds = useMemo(() => new Set(members.map((m) => m.memberId)), [members]);

  const invitedSheetMembers = useMemo(
    () =>
      sheetSessionAddedIds
        .map((id) => members.find((m) => m.memberId === id))
        .filter((m): m is WizardMember => m != null),
    [sheetSessionAddedIds, members],
  );

  const nonOwnerMemberCount = useMemo(
    () => members.filter((m) => !m.isOwner).length,
    [members],
  );

  const inputLocked = mode === 'equal' || mode === 'ownerLess';

  const handleMemberInputFocus = useCallback(
    (index: number) => {
      if (inputLocked || (mode !== 'customPercent' && mode !== 'fixedDollar')) return;
      setTimeout(() => {
        const input = memberInputRefs.current[index];
        const content = scrollContentRef.current;
        if (!input || !content) return;
        input.measureLayout(
          content,
          (_x, y) => {
            const vis = 120;
            scrollRef.current?.scrollTo({ y: Math.max(0, y - vis), animated: true });
          },
          () => {},
        );
      }, 100);
    },
    [inputLocked, mode],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
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
              <TouchableOpacity
                onPress={Keyboard.dismiss}
                activeOpacity={1}
                style={styles.heroHeaderTap}
              >
                <Text style={styles.title}>Who's splitting?</Text>
                <Text style={styles.sub}>Add members and set their share</Text>
                <View style={styles.progWrap}>
                  <View style={styles.progTrack}>
                    <View style={[styles.progFill, { width: '75%' }]} />
                  </View>
                  <Text style={styles.progLabel}>Step 3 of 4</Text>
                </View>
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={[
                styles.body,
                {
                  paddingBottom:
                    Math.max(insets.bottom, 16) + 96 + keyboardHeight + (keyboardHeight > 0 ? 40 : 0),
                },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
            >
              <View ref={scrollContentRef} collapsable={false}>
                <Pressable
                  onPress={Keyboard.dismiss}
                  accessibilityRole="button"
                  accessibilityLabel="Split method"
                  accessibilityHint="Dismisses the keyboard"
                >
                  <Text style={styles.sectionLbl}>Split method</Text>
                </Pressable>
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
                  ref={(el) => {
                    memberInputRefs.current[i] = el;
                  }}
                  value={customPercentStr[i] ?? ''}
                  onChangeText={(t) => setPercentAt(i, t)}
                  onFocus={() => handleMemberInputFocus(i)}
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
                    ref={(el) => {
                      memberInputRefs.current[i] = el;
                    }}
                    value={fixedDollarStr[i] ?? ''}
                    onChangeText={(t) => setDollarAt(i, t)}
                    onFocus={() => handleMemberInputFocus(i)}
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
                <View style={styles.memberAv}>
                  <UserAvatarCircle
                    size={36}
                    uid={m.memberId === 'owner-self' ? searchUser?.uid ?? null : m.memberId}
                    initials={m.initials}
                    imageUrl={m.memberId === 'owner-self' ? profileAvatarUrl : m.avatarUrl}
                    initialsBackgroundColor={m.avatarBg}
                    initialsTextColor={m.avatarColor}
                  />
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
                <View style={styles.memberTrashSlot}>
                  {!m.isOwner ? (
                    <Pressable
                      onPress={() => removeNonOwnerMember(m.memberId)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.memberTrashBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${m.displayName} from split`}
                    >
                      <Ionicons name="trash-outline" size={16} color="#E24B4A" />
                    </Pressable>
                  ) : null}
                </View>
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
          onPress={() => {
            setSheetSessionAddedIds([]);
            setPickerOpen(true);
          }}
          style={styles.addMemberBtn}
          accessibilityRole="button"
          accessibilityLabel="Add member"
        >
          <Text style={styles.addMemberBtnTxt}>+ Add member</Text>
        </Pressable>
          </View>
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
      </KeyboardAvoidingView>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={closeMemberPicker}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeMemberPicker}
            accessibilityRole="button"
            accessibilityLabel="Close add members"
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Add members ({nonOwnerMemberCount} selected)
            </Text>
            <View style={styles.sheetSearchContainer}>
              <Ionicons
                name="search-outline"
                size={20}
                color={C.muted}
                style={styles.sheetSearchLeadingIcon}
              />
              <TextInput
                ref={sheetSearchInputRef}
                value={friendQuery}
                onChangeText={setFriendQuery}
                placeholder="Search friends or enter email…"
                placeholderTextColor={C.muted}
                style={styles.sheetSearchInput}
                returnKeyType="search"
                accessibilityLabel="Search friends"
              />
              {friendQuery.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setFriendQuery('');
                    sheetSearchInputRef.current?.focus();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.sheetSearchClearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <View style={styles.sheetSearchClearCircle}>
                    <Ionicons name="close" size={10} color="#fff" />
                  </View>
                </Pressable>
              ) : null}
            </View>
            {invitedSheetMembers.length > 0 ? (
              <View style={styles.sheetInvitedSection}>
                <Text style={styles.sheetInvitedLabel} accessibilityRole="header">
                  {`INVITED (${invitedSheetMembers.length})`}
                </Text>
                {invitedSheetMembers.map((m) => (
                  <View key={m.memberId} style={styles.sheetInvitedRow}>
                    <UserAvatarCircle
                      size={32}
                      uid={m.memberId.startsWith('invite-email-') ? null : m.memberId}
                      initials={m.initials}
                      imageUrl={m.avatarUrl}
                      initialsBackgroundColor={m.avatarBg}
                      initialsTextColor={m.avatarColor}
                      accessibilityLabel=""
                    />
                    <Text style={styles.sheetInvitedName} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    <Pressable
                      onPress={() => removeNonOwnerMember(m.memberId)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.sheetInvitedRemove}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${m.displayName} from split`}
                    >
                      <Ionicons name="close" size={14} color={C.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.sheetSectionLbl}>Your friends</Text>
            <FlatList
              data={friendsForSheet}
              extraData={members}
              keyExtractor={(item) => item.memberId}
              style={styles.sheetList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                friendQuery.trim().length < 3 ? (
                  <Text style={styles.sheetEmpty}>Type at least 3 characters to search people on mySplit.</Text>
                ) : searchingFriends ? (
                  <View style={styles.sheetEmpty}>
                    <ActivityIndicator color={C.purple} />
                  </View>
                ) : showSearchEmptyState ? (
                  <View style={styles.sheetEmptyCenter}>
                    <View style={styles.sheetEmptyIconCircle}>
                      <Ionicons name="search" size={28} color={C.muted} />
                    </View>
                    <Text style={styles.sheetEmptyTitle}>No one found</Text>
                    <Text style={styles.sheetEmptyBody}>
                      {`${friendQuery.trim()} isn't on mySplit yet. Invite them to join this split.`}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.sheetEmpty}>No matches.</Text>
                )
              }
              ListFooterComponent={
                <Pressable
                  style={styles.sheetInviteRow}
                  onPress={() => {
                    closeMemberPicker();
                    router.push('/invite-share');
                  }}
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
              }
              renderItem={({ item }) => {
                const added = addedMemberIds.has(item.memberId);
                return (
                  <Pressable
                    style={[styles.friendRow, added && styles.friendRowSelected]}
                    onPress={() => onToggleFriendInSplit(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: added }}
                    accessibilityLabel={
                      added
                        ? `${item.displayName}, on split — tap to remove`
                        : `Add ${item.displayName} to split`
                    }
                  >
                    <View style={styles.sheetAvatarWrap}>
                      <View style={[styles.memberAv, item.avatarUrl ? styles.sheetFriendPhotoWrap : null]}>
                        <UserAvatarCircle
                          size={36}
                          uid={item.memberId}
                          initials={item.initials}
                          imageUrl={item.avatarUrl}
                          initialsBackgroundColor={item.avatarBg}
                          initialsTextColor={item.avatarColor}
                          accessibilityLabel=""
                        />
                      </View>
                      {added ? (
                        <View style={styles.sheetAddedBadge} accessibilityLabel="Selected for split">
                          <Ionicons name="checkmark" size={14} color="#fff" />
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
                  </Pressable>
                );
              }}
            />
            <Pressable
              onPress={closeMemberPicker}
              style={({ pressed }) => [styles.sheetDoneBtn, pressed && styles.sheetDoneBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={
                sheetSessionAddedIds.length > 0
                  ? `Add ${sheetSessionAddedIds.length} member${sheetSessionAddedIds.length === 1 ? '' : 's'} and close`
                  : 'Done adding members'
              }
            >
              <Text style={styles.sheetDoneBtnTxt}>
                {sheetSessionAddedIds.length > 0
                  ? `Add ${sheetSessionAddedIds.length} member${sheetSessionAddedIds.length === 1 ? '' : 's'}`
                  : 'Done'}
              </Text>
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
  kav: {
    flex: 1,
  },
  heroHeaderTap: {
    width: '100%',
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
  memberTrashSlot: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberTrashBtn: {
    padding: 2,
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
    zIndex: 1,
    elevation: 8,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D3D1C7',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
    marginBottom: 14,
    textAlign: 'center',
  },
  sheetSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.segBg,
    borderRadius: 12,
    marginBottom: 12,
    paddingLeft: 12,
    paddingRight: 6,
    minHeight: 44,
  },
  sheetSearchLeadingIcon: {
    marginRight: 6,
  },
  sheetSearchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 6,
    fontSize: 16,
    color: C.text,
  },
  sheetSearchClearBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  sheetSearchClearCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetInvitedSection: {
    marginBottom: 14,
  },
  sheetInvitedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sheetInvitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  sheetInvitedName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  sheetInvitedRemove: {
    padding: 4,
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
    flexGrow: 0,
    maxHeight: 280,
  },
  sheetEmpty: {
    fontSize: 15,
    color: C.muted,
    paddingVertical: 20,
    textAlign: 'center',
  },
  sheetEmptyCenter: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  sheetEmptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetEmptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetEmptyBody: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  sheetFriendPhotoWrap: {
    overflow: 'hidden',
  },
  sheetFriendImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  friendRowSelected: {
    backgroundColor: 'rgba(83, 74, 183, 0.06)',
  },
  sheetAvatarWrap: {
    position: 'relative',
  },
  sheetAddedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
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
    marginTop: 0,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.divider,
  },
  sheetDoneBtn: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneBtnPressed: {
    opacity: 0.92,
  },
  sheetDoneBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
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
