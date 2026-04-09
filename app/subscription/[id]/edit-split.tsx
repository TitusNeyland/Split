import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  unstable_batchedUpdates,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { searchUsersForFriendConnect, type FriendSearchUserRow } from '../../../lib/friends/userSearchFirestore';
import { getFriendAvatarColors } from '../../../lib/friends/friendAvatar';
import { UserAvatarCircle } from '../../../components/shared/UserAvatarCircle';
import { initialsFromName } from '../../../lib/profile';
import {
  allocateCents,
  equalCentsSplit,
  equalIntegerPercents,
  fmtCents,
  parseDollarToCents,
  parsePercent,
  percentTotalIsExactly100,
} from '../../../lib/subscription/addSubscriptionSplitMath';
import { formatUsdFromCents } from '../../../lib/format/currency';
import { saveSubscriptionEditSplitToFirestore } from '../../../lib/subscription/editSplitFirestore';
import { useSubscriptionDetailFromFirestore } from '../../../lib/subscription/subscriptionDetailFromFirestore';
import type { SubscriptionDetailMember } from '../../../lib/subscription/subscriptionDetailTypes';
import type { WizardMemberRow, WizardSplitMethod } from '../../../lib/subscription/createSubscriptionWizardFirestore';
import { useFirebaseUid } from '../../../lib/auth/useFirebaseUid';
import { useProfileAvatarUrl } from '../../../hooks/useProfileAvatarUrl';
import { useViewerFirstName } from '../../../hooks/useViewerFirstName';
import { useMergedSplitPreferences } from '../../../lib/split-preferences/useMergedSplitPreferences';
import { formatMemberAmount } from '../../../lib/format/memberAmount';
import { ConfirmSplitChangesBottomSheet, type ConfirmSplitChangeRow } from '../../../components/subscriptions/ConfirmSplitChangesBottomSheet';

const HERO = ['#6B3FA0', '#4A1570', '#2D0D45'] as const;

const C = {
  purple: '#534AB7',
  purpleLight: '#C4B5FD',
  text: '#1a1a18',
  muted: '#888780',
  divider: '#E8E6E1',
  greenDark: '#0F6E56',
  greenTint: '#E1F5EE',
  red: '#E24B4A',
  redTint: '#FCEBEB',
  amberBg: '#FEF3C7',
  amberBorder: 'rgba(180, 83, 9, 0.25)',
  bg: '#F2F0EB',
  card: '#FAFAF8',
  segTrack: '#EDEAE4',
  purpleTint: '#EEEDFE',
  white: '#fff',
};

type SplitEditorMode = 'equal' | 'customPercent' | 'fixedDollar';

type EditRow = {
  key: string;
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
  isOwner: boolean;
  invitePending?: boolean;
  pendingInviteEmail?: string | null;
  inviteId?: string | null;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function mapDetailMemberToRow(m: SubscriptionDetailMember, viewerUid: string): EditRow | null {
  if (m.inviteExpired) return null;
  return {
    key: m.memberId,
    memberId: m.memberId,
    displayName: m.displayName,
    initials: m.initials,
    avatarBg: m.avatarBg,
    avatarColor: m.avatarColor,
    avatarUrl: m.avatarUrl,
    isOwner: m.memberId === viewerUid,
    invitePending: m.invitePending,
    pendingInviteEmail: m.pendingInviteEmail ?? m.rosterEmail ?? null,
    inviteId: m.inviteId ?? null,
  };
}

function methodToWizard(m: SplitEditorMode): WizardSplitMethod {
  if (m === 'equal') return 'equal';
  if (m === 'customPercent') return 'custom_percent';
  return 'fixed_amount';
}

function methodLabel(m: SplitEditorMode): string {
  if (m === 'equal') return 'Equal';
  if (m === 'customPercent') return 'Custom %';
  return 'Fixed $';
}

function defaultMethodToEditor(method: string): SplitEditorMode {
  if (method === 'customPercent') return 'customPercent';
  if (method === 'fixedDollar') return 'fixedDollar';
  return 'equal';
}

function buildSplitChangesList(
  originalMembers: SubscriptionDetailMember[],
  newMembers: WizardMemberRow[]
): ConfirmSplitChangeRow[] {
  const changes: ConfirmSplitChangeRow[] = [];
  const originalById = new Map(originalMembers.map((m) => [m.memberId, m]));
  const newById = new Map(newMembers.map((m) => [m.memberId, m]));

  // Check for removed members
  for (const [id, orig] of originalById) {
    if (!newById.has(id)) {
      const firstName = orig.displayName.split('(')[0]?.trim() || orig.displayName;
      changes.push({
        label: `${firstName} removed`,
        newValue: '—',
        variant: 'removed',
      });
    }
  }

  // Check for added and changed members
  for (const newMem of newMembers) {
    const orig = originalById.get(newMem.memberId);
    if (!orig) {
      // New member added
      const firstName = newMem.displayName.split('(')[0]?.trim() || newMem.displayName;
      changes.push({
        label: `${firstName} added`,
        newValue: `${formatUsdFromCents(newMem.amountCents)} · ${Math.round(newMem.percent)}%`,
      });
    } else {
      // Check if amount or percent changed
      if (
        Math.abs(newMem.percent - orig.percent) > 0.01 ||
        Math.abs(newMem.amountCents - orig.amountCents) > 1
      ) {
        const firstName = newMem.displayName.split('(')[0]?.trim() || newMem.displayName;
        changes.push({
          label: `${firstName}'s share`,
          oldValue: `${formatUsdFromCents(orig.amountCents)} · ${Math.round(orig.percent)}%`,
          newValue: `${formatUsdFromCents(newMem.amountCents)} · ${Math.round(newMem.percent)}%`,
        });
      }
    }
  }

  return changes;
}

export default function EditSplitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const subscriptionId = typeof id === 'string' ? id : id?.[0] ?? '';
  const firebaseUid = useFirebaseUid();
  const { avatarUrl: userAvatarUrl } = useProfileAvatarUrl();
  const { firstName: viewerFirstName } = useViewerFirstName();
  const splitPrefs = useMergedSplitPreferences();

  const { detail, loading, error } = useSubscriptionDetailFromFirestore(
    subscriptionId,
    firebaseUid,
    userAvatarUrl,
    viewerFirstName,
    { enabled: Boolean(subscriptionId.trim()) }
  );

  const [rows, setRows] = useState<EditRow[]>([]);
  const [mode, setMode] = useState<SplitEditorMode>('equal');
  const [customPercentStr, setCustomPercentStr] = useState<string[]>([]);
  const [fixedDollarStr, setFixedDollarStr] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSheetVisible, setConfirmSheetVisible] = useState(false);
  const [pendingSaveMembers, setPendingSaveMembers] = useState<WizardMemberRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  const [searchResults, setSearchResults] = useState<FriendSearchUserRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  /** Membership differs from loaded snapshot (add/remove); snapshot compare can miss updates when batched with split arrays. */
  const [membersDirty, setMembersDirty] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);
  const initialPercentByMemberIdRef = useRef<Map<string, string>>(new Map());
  const initialFixedByMemberIdRef = useRef<Map<string, string>>(new Map());
  const initialMemberIdsRef = useRef<Set<string>>(new Set());
  const didInit = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottomForAddPeople = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, Platform.OS === 'ios' ? 80 : 120);
    });
  }, []);

  const onOpenInviteShare = useCallback(() => {
    router.push({
      pathname: '/invite-share',
      params: {
        splitId: subscriptionId,
        suggestedName: detail?.displayName ?? '',
      },
    });
  }, [router, subscriptionId, detail?.displayName]);

  useEffect(() => {
    if (!detail || !firebaseUid) return;
    if (!detail.isOwner) return;
    if (didInit.current) return;
    const r = detail.members
      .map((m) => mapDetailMemberToRow(m, firebaseUid))
      .filter((x): x is EditRow => Boolean(x));
    const cp = equalIntegerPercents(r.length).map(String);
    const fd = equalCentsSplit(detail.totalCents, r.length).map((c) => (c / 100).toFixed(2));
    const pctMap = new Map<string, string>();
    const fxMap = new Map<string, string>();
    r.forEach((row, i) => {
      pctMap.set(row.memberId, cp[i] ?? '0');
      fxMap.set(row.memberId, fd[i] ?? '0');
    });
    initialPercentByMemberIdRef.current = pctMap;
    initialFixedByMemberIdRef.current = fxMap;
    initialMemberIdsRef.current = new Set(r.map((x) => x.memberId));
    const selectedMode = defaultMethodToEditor(splitPrefs.defaultSplitMethod);
    setRows(r);
    setCustomPercentStr(cp);
    setFixedDollarStr(fd);
    setMode(selectedMode);
    didInit.current = true;
    initialSnapshotRef.current = JSON.stringify({
      rows: r,
      mode: selectedMode,
      customPercentStr: cp,
      fixedDollarStr: fd,
    });
  }, [detail, firebaseUid, splitPrefs.defaultSplitMethod]);

  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 3 || !firebaseUid) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    void searchUsersForFriendConnect({ currentUid: firebaseUid, searchText: debouncedSearch })
      .then((list) => {
        if (!cancelled) setSearchResults(list);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, firebaseUid]);

  const n = rows.length;
  const totalCents = detail?.totalCents ?? 0;

  const equalPercents = useMemo(() => equalIntegerPercents(n), [n]);
  const equalCents = useMemo(() => equalCentsSplit(totalCents, n), [totalCents, n]);

  const customParsed = useMemo(() => customPercentStr.map(parsePercent), [customPercentStr]);
  const customValid = useMemo(
    () => percentTotalIsExactly100(customParsed),
    [customParsed]
  );
  const customSum = useMemo(
    () => customParsed.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
    [customParsed]
  );

  const rowCents = useMemo(() => {
    if (mode === 'equal') return equalCents;
    if (mode === 'customPercent') {
      if (customParsed.some((v) => !Number.isFinite(v))) return Array.from({ length: n }, () => 0);
      const sum = customParsed.reduce((a, b) => a + b, 0);
      if (sum <= 0) return Array.from({ length: n }, () => 0);
      return allocateCents(totalCents, customParsed);
    }
    return fixedDollarStr.map((s) => {
      const c = parseDollarToCents(s);
      return Number.isFinite(c) ? c : 0;
    });
  }, [mode, equalCents, customParsed, totalCents, n, fixedDollarStr]);

  const fixedSumOk = useMemo(() => {
    if (mode !== 'fixedDollar') return true;
    const sum = fixedDollarStr.reduce((a, s) => a + (Number.isFinite(parseDollarToCents(s)) ? parseDollarToCents(s) : 0), 0);
    return Math.abs(sum - totalCents) < 2;
  }, [mode, fixedDollarStr, totalCents]);

  const snapshotDirty = useMemo(() => {
    if (!initialSnapshotRef.current || !detail) return false;
    return (
      JSON.stringify({ rows, mode, customPercentStr, fixedDollarStr }) !== initialSnapshotRef.current
    );
  }, [rows, mode, customPercentStr, fixedDollarStr, detail]);

  /** Roster membership vs initial (IDs only) — avoids Save staying disabled when full snapshot compare misses batched updates after remove. */
  const membershipChangedFromInitial = useMemo(() => {
    if (!initialSnapshotRef.current) return false;
    try {
      const snap = JSON.parse(initialSnapshotRef.current) as { rows: EditRow[] };
      const a = snap.rows
        .map((x) => x.memberId)
        .sort()
        .join(',');
      const b = rows
        .map((x) => x.memberId)
        .sort()
        .join(',');
      return a !== b;
    } catch {
      return false;
    }
  }, [rows]);

  const dirty = snapshotDirty || membersDirty || membershipChangedFromInitial;

  const canSave =
    !saving &&
    detail &&
    n >= 1 &&
    (mode === 'equal' || (mode === 'customPercent' && customValid) || (mode === 'fixedDollar' && fixedSumOk));

  const overageCents = useMemo(() => {
    if (mode !== 'customPercent' || customValid || !Number.isFinite(customSum)) return 0;
    const diffPct = customSum - 100;
    return Math.round((totalCents * diffPct) / 100);
  }, [mode, customValid, customSum, totalCents]);

  const selectEqual = useCallback(() => {
    setMode('equal');
    setCustomPercentStr(equalIntegerPercents(n).map(String));
    setFixedDollarStr(equalCentsSplit(totalCents, n).map((c) => (c / 100).toFixed(2)));
  }, [n, totalCents]);

  const selectCustomPercent = useCallback(() => {
    setMode('customPercent');
    setCustomPercentStr((prev) =>
      prev.length === rows.length ? prev : equalIntegerPercents(rows.length).map(String),
    );
  }, [rows.length]);

  const selectFixed = useCallback(() => {
    setMode('fixedDollar');
    const cents =
      mode === 'equal'
        ? equalCentsSplit(totalCents, n)
        : mode === 'customPercent' && customValid
          ? allocateCents(totalCents, customParsed)
          : equalCentsSplit(totalCents, n);
    setFixedDollarStr(cents.map((c) => (c / 100).toFixed(2)));
  }, [mode, totalCents, n, customValid, customParsed]);

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
      next[i] = text;
      return next;
    });
  };

  const discardChanges = useCallback(() => {
    const raw = initialSnapshotRef.current;
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as {
        rows: EditRow[];
        mode: SplitEditorMode;
        customPercentStr: string[];
        fixedDollarStr: string[];
      };
      setRows(p.rows);
      setMode(p.mode);
      setCustomPercentStr(p.customPercentStr);
      setFixedDollarStr(p.fixedDollarStr);
      setMembersDirty(false);
    } catch {
      /* ignore */
    }
  }, []);

  const removeMember = (r: EditRow) => {
    if (r.isOwner) return;
    const first = r.displayName.split('(')[0]?.trim() ?? 'this member';
    Alert.alert(
      `Remove ${first}?`,
      'Their share will be redistributed among remaining members.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            unstable_batchedUpdates(() => {
              setMembersDirty(true);
              setRows((prev) => {
                const next = prev.filter((x) => x.key !== r.key);
                const nn = next.length;
                setCustomPercentStr(equalIntegerPercents(nn).map(String));
                setFixedDollarStr(equalCentsSplit(totalCents, nn).map((c) => (c / 100).toFixed(2)));
                return next;
              });
            });
          },
        },
      ]
    );
  };

  const addFriendRow = (f: FriendSearchUserRow) => {
    if (rows.some((x) => x.memberId === f.uid)) return;
    const { backgroundColor, color } = getFriendAvatarColors(f.uid);
    const row: EditRow = {
      key: `add-${f.uid}-${Date.now()}`,
      memberId: f.uid,
      displayName: f.displayName,
      initials: initialsFromName(f.displayName),
      avatarBg: backgroundColor,
      avatarColor: color,
      avatarUrl: f.avatarUrl,
      isOwner: false,
      invitePending: true,
      pendingInviteEmail: null,
      inviteId: null,
    };
    setMembersDirty(true);
    setRows((prev) => {
      const next = [...prev, row];
      const nn = next.length;
      setCustomPercentStr(equalIntegerPercents(nn).map(String));
      setFixedDollarStr(equalCentsSplit(totalCents, nn).map((c) => (c / 100).toFixed(2)));
      return next;
    });
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  };

  const buildWizardMembers = (): WizardMemberRow[] => {
    return rows.map((r, i) => {
      let percent = equalPercents[i] ?? 0;
      let amountCents = rowCents[i] ?? 0;
      if (mode === 'customPercent') {
        const p = customParsed[i];
        percent = Number.isFinite(p) ? p! : 0;
        amountCents = rowCents[i] ?? 0;
      } else if (mode === 'fixedDollar') {
        amountCents = Number.isFinite(parseDollarToCents(fixedDollarStr[i] ?? ''))
          ? parseDollarToCents(fixedDollarStr[i] ?? '')
          : 0;
        const t = totalCents > 0 ? (100 * amountCents) / totalCents : 0;
        percent = Math.round(t * 100) / 100;
      }
      return {
        memberId: r.memberId,
        displayName: r.displayName,
        initials: r.initials,
        avatarBg: r.avatarBg,
        avatarColor: r.avatarColor,
        role: r.isOwner ? 'owner' : 'member',
        percent,
        amountCents: Math.round(amountCents),
        invitePending: r.isOwner ? false : Boolean(r.invitePending),
        pendingInviteEmail: r.pendingInviteEmail ?? undefined,
        inviteId: r.inviteId ?? undefined,
      };
    });
  };

  const performSave = async () => {
    if (!canSave || !detail || !firebaseUid) return;
    
    const members = buildWizardMembers();
    
    // Check if confirmation is needed
    if (splitPrefs.confirmBeforeSplitChanges) {
      const changes = buildSplitChangesList(detail.members, members);
      setPendingSaveMembers(members);
      setConfirmSheetVisible(true);
      return;
    }
    
    // Save immediately without confirmation
    await commitSave(members);
  };

  const commitSave = async (members: WizardMemberRow[]) => {
    if (!detail || !firebaseUid) return;
    setSaving(true);
    try {
      const effectiveFrom = splitPrefs.changesEffectiveNextCycle ? 'next_cycle' : 'immediate';
      await saveSubscriptionEditSplitToFirestore({
        subscriptionId: detail.id,
        ownerUid: firebaseUid,
        totalCents: detail.totalCents,
        splitMethod: methodToWizard(mode),
        members,
        effectiveFrom,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const onConfirmChanges = async () => {
    if (pendingSaveMembers) {
      setConfirmSheetVisible(false);
      await commitSave(pendingSaveMembers);
    }
  };

  const memberStatusLine = (r: EditRow): string => {
    if (r.isOwner) return 'Owner';
    if (!initialMemberIdsRef.current.has(r.memberId) && r.invitePending) return 'New · invite on save';
    if (r.invitePending) return 'Pending invite';
    return 'Active';
  };

  const percentInputBorderStyle = (r: EditRow, i: number) => {
    if (mode === 'equal') return styles.pctInDefault;
    if (mode === 'fixedDollar') {
      const init = initialFixedByMemberIdRef.current.get(r.memberId);
      const cur = fixedDollarStr[i] ?? '';
      if (!initialMemberIdsRef.current.has(r.memberId)) return styles.pctInNew;
      if (init !== undefined && cur !== init) return styles.pctInChanged;
      return styles.pctInDefault;
    }
    if (mode === 'customPercent') {
      if (!customValid) return styles.pctInError;
      if (!initialMemberIdsRef.current.has(r.memberId)) return styles.pctInNew;
      const init = initialPercentByMemberIdRef.current.get(r.memberId);
      const cur = customPercentStr[i] ?? '';
      if (init !== undefined && cur !== init) return styles.pctInChanged;
      return styles.pctInDefault;
    }
    return styles.pctInDefault;
  };

  const billingSubtitle = useMemo(() => {
    if (!detail) return '';
    const cycle = detail.billingCycleLabel.toLowerCase();
    return `${fmtCents(totalCents)} ${cycle} · changes apply next cycle`;
  }, [detail, totalCents]);

  const changesPreviewLines = useMemo(() => {
    if (!dirty || !initialSnapshotRef.current) return [];
    let snap: {
      mode: SplitEditorMode;
      rows: EditRow[];
      customPercentStr?: string[];
    };
    try {
      snap = JSON.parse(initialSnapshotRef.current);
    } catch {
      return [];
    }
    const lines: string[] = [];
    if (snap.mode !== mode) {
      lines.push(`Split method: ${methodLabel(snap.mode)} → ${methodLabel(mode)}`);
    }
    const prevIds = new Set(snap.rows.map((x) => x.memberId));
    const curIds = new Set(rows.map((x) => x.memberId));
    const removed = snap.rows.filter((x) => !curIds.has(x.memberId));
    for (const rm of removed) {
      lines.push(`${rm.displayName.split('(')[0]?.trim() ?? 'Member'} removed from split`);
    }
    const added = rows.filter((r) => !prevIds.has(r.memberId));
    for (const a of added) {
      lines.push(`${a.displayName.split('(')[0]?.trim() ?? 'Member'} added · invite sent on save`);
    }
    if (mode === 'customPercent' && customValid && customParsed.length > 0) {
      const first = customParsed[0];
      const allSame =
        Number.isFinite(first) && customParsed.every((v) => Number.isFinite(v) && v === first);
      if (allSame) {
        lines.push(`All shares: ${Math.round(first!)}% each`);
      }
    } else if (mode === 'equal' && rows.length !== snap.rows.length && rows.length > 0) {
      const p = equalIntegerPercents(rows.length);
      const v = p[0];
      if (p.every((x) => x === v)) {
        lines.push(`All shares: ${v}% each`);
      }
    }
    return lines;
  }, [dirty, rows, mode, customValid, customParsed]);

  const filteredSearchResults = useMemo(
    () => searchResults.filter((f) => !rows.some((r) => r.memberId === f.uid)),
    [searchResults, rows]
  );

  if (loading || !detail) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.purple} />
      </View>
    );
  }

  if (error || !detail.isOwner) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.bodyMuted}>
          {error ? 'Could not load subscription.' : 'Only the split owner can edit this split.'}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.textBtn}>
          <Text style={styles.textBtnLbl}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const showPctSummary = mode === 'customPercent';
  const showFixedSummary = mode === 'fixedDollar';
  const pctError = showPctSummary && !customValid;
  const fixedError = showFixedSummary && !fixedSumOk;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <LinearGradient colors={HERO} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ paddingTop: insets.top }}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroLeft}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backHit}
            >
              <Ionicons name="chevron-back" size={26} color={C.white} />
            </Pressable>
            <Text style={styles.heroBrand} numberOfLines={1}>
              {detail.displayName}
            </Text>
          </View>
        </View>
        <View style={styles.heroTitleBlock}>
          <Text style={styles.heroScreenTitle}>Edit split</Text>
          <Text style={styles.heroSubtitle}>{billingSubtitle}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheet}>
          <Text style={styles.kicker}>Split method</Text>
          <View style={styles.seg3}>
            {(
              [
                { id: 'equal' as const, label: 'Equal' },
                { id: 'customPercent' as const, label: 'Custom %' },
                { id: 'fixedDollar' as const, label: 'Fixed $' },
              ] as const
            ).map((opt) => {
              const on = mode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={
                    opt.id === 'equal' ? selectEqual : opt.id === 'customPercent' ? selectCustomPercent : selectFixed
                  }
                  style={[styles.seg3Btn, on && styles.seg3BtnOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.seg3Txt, on && styles.seg3TxtOn]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.kicker, styles.kickerSpaced]}>{`Members (${n})`}</Text>

          {rows.map((r, i) => {
            const locked = mode === 'equal';
            let inputInner: ReactNode;
            if (mode === 'equal') {
              inputInner = <Text style={styles.pctLockedTxt}>{`${equalPercents[i] ?? 0}%`}</Text>;
            } else if (mode === 'customPercent') {
              inputInner = (
                <TextInput
                  value={customPercentStr[i] ?? ''}
                  onChangeText={(t) => setPercentAt(i, t)}
                  keyboardType="decimal-pad"
                  style={styles.pctInputInner}
                  placeholder="0"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                />
              );
            } else {
              inputInner = (
                <TextInput
                  value={fixedDollarStr[i] ?? ''}
                  onChangeText={(t) => setDollarAt(i, t)}
                  keyboardType="decimal-pad"
                  style={styles.pctInputInner}
                  placeholder="0.00"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                />
              );
            }
            const borderStyle = locked ? styles.pctInEqual : percentInputBorderStyle(r, i);
            const avStyle = [
              styles.av,
              r.avatarUrl ? styles.avPhoto : { backgroundColor: r.avatarBg },
              !initialMemberIdsRef.current.has(r.memberId) && r.invitePending ? styles.avNew : null,
            ];
            return (
              <View key={r.key} style={styles.memberCard}>
                <View style={styles.memberTop}>
                  <View style={avStyle}>
                    <UserAvatarCircle
                      size={40}
                      uid={r.memberId}
                      initials={r.initials}
                      imageUrl={r.avatarUrl}
                      initialsBackgroundColor={r.avatarBg}
                      initialsTextColor={r.avatarColor}
                    />
                  </View>
                  <View style={styles.memberTextCol}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {r.displayName.replace(/\s*\(you\)\s*$/i, '').trim() || r.displayName}
                    </Text>
                    <Text style={styles.memberStatus}>{memberStatusLine(r)}</Text>
                  </View>
                  <View style={[styles.pctIn, borderStyle]}>
                    {locked ? (
                      inputInner
                    ) : (
                      <View style={styles.pctInInnerWrap}>{inputInner}</View>
                    )}
                  </View>
                  <Text style={styles.amt}>{fmtCents(rowCents[i] ?? 0)}</Text>
                  {!r.isOwner ? (
                    <Pressable
                      onPress={() => removeMember(r)}
                      hitSlop={8}
                      style={styles.removeHit}
                      accessibilityLabel="Remove member"
                    >
                      <View style={styles.removeBox} />
                    </Pressable>
                  ) : (
                    <View style={styles.removeHit} />
                  )}
                </View>
              </View>
            );
          })}

          {showPctSummary ? (
            <View style={[styles.totalBar, pctError ? styles.totalBarErr : styles.totalBarOk]}>
              <Text style={[styles.totalBarLeft, pctError ? styles.totalBarTxtErr : styles.totalBarTxtOk]}>
                {pctError
                  ? `Total: ${customSum.toFixed(1)}% — must equal 100%`
                  : 'Total: 100%'}
              </Text>
              <Text style={[styles.totalBarRight, pctError ? styles.totalBarTxtErr : styles.totalBarTxtOk]}>
                {pctError
                  ? overageCents !== 0
                    ? `${overageCents > 0 ? '+' : ''}${fmtCents(Math.abs(overageCents))}`
                    : '—'
                  : `${fmtCents(totalCents)} ✓`}
              </Text>
            </View>
          ) : null}

          {showFixedSummary ? (
            <View style={[styles.totalBar, fixedSumOk ? styles.totalBarOk : styles.totalBarErr]}>
              <Text style={[styles.totalBarLeft, fixedSumOk ? styles.totalBarTxtOk : styles.totalBarTxtErr]}>
                {fixedSumOk ? 'Amounts match total' : 'Fixed amounts must match subscription total'}
              </Text>
              <Text style={[styles.totalBarRight, fixedSumOk ? styles.totalBarTxtOk : styles.totalBarTxtErr]}>
                {fixedSumOk ? `${fmtCents(totalCents)} ✓` : '—'}
              </Text>
            </View>
          ) : null}

          {pctError ? (
            <View style={styles.warnBanner}>
              <Ionicons name="warning-outline" size={18} color="#B45309" style={styles.warnIcon} />
              <Text style={styles.warnTxt}>
                Percentages must add up to exactly 100% before you can save.
              </Text>
            </View>
          ) : null}

          {dirty && changesPreviewLines.length > 0 ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewKicker}>Changes preview</Text>
              {changesPreviewLines.map((line, idx) => (
                <Text key={`${idx}-${line.slice(0, 12)}`} style={styles.previewLine}>
                  · {line}
                </Text>
              ))}
            </View>
          ) : null}

          <Text style={[styles.kicker, styles.kickerSpaced]}>Add people</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color={C.muted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search friends by name"
              placeholderTextColor={C.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={scrollToBottomForAddPeople}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {searchLoading ? (
            <ActivityIndicator style={{ marginVertical: 10 }} color={C.purple} />
          ) : null}
          {filteredSearchResults.map((item) => {
            const av = getFriendAvatarColors(item.uid);
            return (
              <Pressable
                key={item.uid}
                style={styles.searchRow}
                onPress={() => addFriendRow(item)}
              >
                <View style={styles.searchRowLeft}>
                  <View style={[styles.searchAv, { backgroundColor: av.backgroundColor }]}>
                    <Text style={[styles.searchAvTxt, { color: av.color }]}>
                      {initialsFromName(item.displayName)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.searchName}>{item.displayName}</Text>
                    <Text style={styles.searchHandle}>{item.usernameHandle}</Text>
                  </View>
                </View>
                <Text style={styles.addLbl}>Add</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={styles.inviteShareRow}
            onPress={onOpenInviteShare}
            accessibilityRole="button"
            accessibilityLabel="Invite to mySplit, share link"
          >
            <View style={styles.inviteShareIco}>
              <Ionicons name="share-outline" size={20} color={C.purple} />
            </View>
            <View style={styles.inviteShareCopy}>
              <Text style={styles.inviteShareTitle}>Invite to mySplit</Text>
              <Text style={styles.inviteShareSub}>Share an invite link</Text>
            </View>
          </Pressable>

          <View style={styles.footerArea}>
            {!dirty ? (
              <>
                <Text style={styles.noChanges}>No changes yet</Text>
                <Pressable style={styles.cancelOutline} onPress={() => router.back()} accessibilityRole="button">
                  <Text style={styles.cancelOutlineTxt}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={[styles.primarySave, (!canSave || !dirty) && styles.primarySaveOff]}
                  onPress={() => void performSave()}
                  disabled={!canSave || !dirty}
                >
                  <Text style={styles.primarySaveTxt}>
                    {pctError ? (
                      'Fix percentages to save'
                    ) : fixedError ? (
                      'Fix amounts to save'
                    ) : (
                      <>
                        Save changes — <Text style={styles.primarySaveSub}>
                          effective {splitPrefs.changesEffectiveNextCycle ? 'next cycle' : 'immediately'}
                        </Text>
                      </>
                    )}
                  </Text>
                </Pressable>
                <Pressable onPress={discardChanges} style={styles.discardBtn}>
                  <Text style={styles.discardTxt}>Discard changes</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      {detail && (
        <ConfirmSplitChangesBottomSheet
          isVisible={confirmSheetVisible}
          onConfirm={onConfirmChanges}
          onCancel={() => setConfirmSheetVisible(false)}
          title="Confirm split changes"
          changes={
            pendingSaveMembers
              ? buildSplitChangesList(detail.members, pendingSaveMembers)
              : []
          }
          effectiveMessage={
            splitPrefs.changesEffectiveNextCycle
              ? 'Changes will take effect next cycle'
              : 'Changes will take effect immediately'
          }
          loading={saving}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  screen: { flex: 1, padding: 24, justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  bodyMuted: { fontSize: 16, color: C.muted, textAlign: 'center', lineHeight: 22 },
  textBtn: { marginTop: 16, padding: 12 },
  textBtnLbl: { fontSize: 16, color: C.purple, fontWeight: '700', textAlign: 'center' },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  heroLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0, gap: 4 },
  backHit: { padding: 4 },
  heroBrand: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  heroTitleBlock: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    paddingTop: 4,
  },
  heroScreenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.white,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 21,
  },
  scroll: {
    paddingHorizontal: 0,
  },
  sheet: {
    backgroundColor: C.card,
    marginTop: -12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  kickerSpaced: { marginTop: 22, marginBottom: 10 },
  seg3: {
    flexDirection: 'row',
    backgroundColor: C.segTrack,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  seg3Btn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    minWidth: 0,
  },
  seg3BtnOn: {
    backgroundColor: C.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  seg3Txt: { fontSize: 13, fontWeight: '600', color: C.muted },
  seg3TxtOn: { color: C.purple },
  memberCard: {
    marginBottom: 12,
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.divider,
  },
  memberTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  av: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avNew: {
    borderWidth: 2,
    borderColor: '#34D399',
    borderStyle: 'dashed',
  },
  avPhoto: { backgroundColor: '#E8E6E1' },
  avImg: { width: 40, height: 40, borderRadius: 20 },
  avTxt: { fontSize: 14, fontWeight: '700' },
  memberTextCol: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 16, fontWeight: '600', color: C.text },
  memberStatus: { fontSize: 13, color: C.muted, marginTop: 2 },
  pctIn: {
    width: 76,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#FAFAF8',
  },
  pctInEqual: {
    borderColor: 'rgba(26,26,24,0.35)',
  },
  pctInDefault: {
    borderColor: 'rgba(26,26,24,0.35)',
  },
  pctInChanged: {
    borderColor: C.purple,
    backgroundColor: 'rgba(83, 74, 183, 0.06)',
  },
  pctInNew: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
  },
  pctInError: {
    borderColor: C.red,
    backgroundColor: C.redTint,
  },
  pctInInnerWrap: { width: '100%', alignItems: 'center' },
  pctLockedTxt: { fontSize: 16, fontWeight: '700', color: C.text },
  pctInputInner: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 40,
  },
  amt: { width: 68, textAlign: 'right', fontSize: 15, fontWeight: '700', color: C.text },
  removeHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  removeBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.divider,
  },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 6,
  },
  totalBarOk: { backgroundColor: C.greenTint },
  totalBarErr: { backgroundColor: C.redTint },
  totalBarLeft: { flex: 1, fontSize: 14, fontWeight: '600' },
  totalBarRight: { fontSize: 14, fontWeight: '700' },
  totalBarTxtOk: { color: C.greenDark },
  totalBarTxtErr: { color: '#A32D2D' },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.amberBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.amberBorder,
    marginBottom: 8,
  },
  warnIcon: { marginTop: 1 },
  warnTxt: { flex: 1, fontSize: 14, color: '#92400E', lineHeight: 20, fontWeight: '500' },
  previewCard: {
    backgroundColor: 'rgba(83, 74, 183, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(83, 74, 183, 0.15)',
  },
  previewKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: C.purple,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  previewLine: { fontSize: 14, color: C.text, lineHeight: 22, marginBottom: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.divider,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 10 },
  inviteShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.divider,
  },
  inviteShareIco: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteShareCopy: { flex: 1, minWidth: 0 },
  inviteShareTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  inviteShareSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  searchRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  searchAv: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAvTxt: { fontSize: 14, fontWeight: '700' },
  searchName: { fontSize: 16, fontWeight: '600', color: C.text },
  searchHandle: { fontSize: 13, color: C.muted, marginTop: 2 },
  addLbl: { fontSize: 15, fontWeight: '700', color: C.purple },
  footerArea: { marginTop: 28, marginBottom: 8, alignItems: 'center', gap: 14 },
  noChanges: { fontSize: 14, color: C.muted, fontWeight: '500' },
  cancelOutline: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.divider,
    alignItems: 'center',
    backgroundColor: C.white,
  },
  cancelOutlineTxt: { fontSize: 17, fontWeight: '600', color: C.text },
  primarySave: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: C.purple,
    alignItems: 'center',
  },
  primarySaveOff: { opacity: 0.45 },
  primarySaveTxt: { fontSize: 17, fontWeight: '700', color: C.white, textAlign: 'center' },
  primarySaveSub: { fontWeight: '500', opacity: 0.92 },
  discardBtn: { paddingVertical: 8 },
  discardTxt: { fontSize: 16, fontWeight: '600', color: C.muted },
});
