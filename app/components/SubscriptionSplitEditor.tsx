import { useCallback, useMemo, useState, type ReactNode } from 'react';
;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { getFirebaseAuth } from '../../lib/firebase';
import {
  saveSubscriptionSplitToFirestore,
  type FirestoreMemberShare,
  type FirestoreSplitMethod,
} from '../../lib/subscriptionSplitFirestore';
import {
  allocateCents,
  equalCentsSplit,
  equalIntegerPercents,
  fmtCents,
  parseDollarToCents,
  parsePercent,
  percentTotalIsExactly100,
} from '../../lib/addSubscriptionSplitMath';
const C = {
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  green: '#1D9E75',
  greenDark: '#0F6E56',
  divider: '#F0EEE9',
};

export type SplitEditorMode = 'equal' | 'customPercent' | 'fixedDollar';

export type SplitEditorMember = {
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
};

export type SubscriptionSplitEditorProps = {
  subscriptionId: string;
  /** Subscription total in cents (e.g. 2299 for $22.99). */
  totalCents: number;
  members: SplitEditorMember[];
  /** When the saved split becomes effective (start of next billing cycle). */
  nextCycleEffectiveFrom: Date;
  onCancel: () => void;
  onSaved?: () => void;
  /** If true, skip Firestore (e.g. design demo). */
  skipFirestore?: boolean;
};

function methodToFirestore(m: SplitEditorMode): FirestoreSplitMethod {
  if (m === 'equal') return 'equal';
  if (m === 'customPercent') return 'custom_percent';
  return 'fixed_amount';
}

export function SubscriptionSplitEditor({
  subscriptionId,
  totalCents,
  members,
  nextCycleEffectiveFrom,
  onCancel,
  onSaved,
  skipFirestore = false,
}: SubscriptionSplitEditorProps) {
  const n = members.length;

  const [mode, setMode] = useState<SplitEditorMode>('equal');
  const [customPercentStr, setCustomPercentStr] = useState<string[]>(() =>
    equalIntegerPercents(n).map(String)
  );
  const [fixedDollarStr, setFixedDollarStr] = useState<string[]>(() =>
    equalCentsSplit(totalCents, n).map((c) => (c / 100).toFixed(2))
  );
  const [saving, setSaving] = useState(false);

  const equalPercents = useMemo(() => equalIntegerPercents(n), [n]);
  const equalCents = useMemo(() => equalCentsSplit(totalCents, n), [totalCents, n]);

  const customParsed = useMemo(
    () => customPercentStr.map(parsePercent),
    [customPercentStr]
  );
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
      if (customParsed.some((v) => !Number.isFinite(v))) {
        return Array.from({ length: n }, () => 0);
      }
      const sum = customParsed.reduce((a, b) => a + b, 0);
      if (sum <= 0) return Array.from({ length: n }, () => 0);
      return allocateCents(totalCents, customParsed);
    }
    return fixedDollarStr.map((s) => {
      const c = parseDollarToCents(s);
      return Number.isFinite(c) ? c : 0;
    });
  }, [mode, equalCents, customParsed, totalCents, n, fixedDollarStr]);

  const validationBarVisible = mode === 'customPercent';

  const selectEqual = useCallback(() => {
    setMode('equal');
    setCustomPercentStr(equalIntegerPercents(n).map(String));
    setFixedDollarStr(equalCentsSplit(totalCents, n).map((c) => (c / 100).toFixed(2)));
  }, [n, totalCents]);

  const selectCustom = useCallback(() => {
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
    } else {
      setCustomPercentStr(equalIntegerPercents(n).map(String));
    }
    setMode('customPercent');
  }, [mode, fixedDollarStr, n]);

  const selectFixed = useCallback(() => {
    let cents: number[];
    if (mode === 'equal') {
      cents = equalCentsSplit(totalCents, n);
    } else if (mode === 'customPercent') {
      const p = customPercentStr.map(parsePercent);
      if (p.every(Number.isFinite) && percentTotalIsExactly100(p)) {
        cents = allocateCents(totalCents, p);
      } else {
        const sum = p.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        cents =
          sum > 0 ? allocateCents(totalCents, p) : equalCentsSplit(totalCents, n);
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

  const buildMemberShares = (): FirestoreMemberShare[] => {
    if (mode === 'equal') {
      return members.map((m, i) => ({
        memberId: m.memberId,
        percent: equalPercents[i],
        amountCents: equalCents[i]!,
      }));
    }
    if (mode === 'customPercent') {
      const p = customPercentStr.map(parsePercent);
      const c = allocateCents(totalCents, p);
      return members.map((m, i) => ({
        memberId: m.memberId,
        percent: p[i],
        amountCents: c[i]!,
      }));
    }
    const c = fixedDollarStr.map(parseDollarToCents);
    return members.map((m, i) => ({
      memberId: m.memberId,
      amountCents: Number.isFinite(c[i]) ? c[i]! : 0,
    }));
  };

  const saveDisabled =
    saving || (mode === 'customPercent' && !customValid);

  const performSave = async () => {
    if (saveDisabled) return;
    setSaving(true);
    try {
      const shares = buildMemberShares();
      if (!skipFirestore) {
        const auth = getFirebaseAuth();
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          throw new Error('Sign in to save split changes.');
        }
        await saveSubscriptionSplitToFirestore({
          subscriptionId,
          actorUid: uid,
          method: methodToFirestore(mode),
          memberShares: shares,
          effectiveFrom: nextCycleEffectiveFrom,
          previousSnapshot: null,
        });
      }
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not save', msg);
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (saveDisabled) return;
    Alert.alert(
      'Save split?',
      'Are you sure you want to save this split? It will take effect on the next billing cycle.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => void performSave() },
      ]
    );
  };

  const inputDisplayEqualPercent = (i: number) => `${equalPercents[i]}%`;

  return (
    <View style={styles.root}>
      <View style={styles.seHeader}>
        <Text style={styles.seTitle}>Split method</Text>
        <View style={styles.seMethod}>
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
                  opt.id === 'equal'
                    ? selectEqual
                    : opt.id === 'customPercent'
                      ? selectCustom
                      : selectFixed
                }
                style={[styles.seOpt, on && styles.seOptOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.seOptTxt, on && styles.seOptTxtOn]} numberOfLines={1}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {members.map((m, i) => {
        const isLast = i === members.length - 1;
        const locked = mode === 'equal';

        let inputInner: ReactNode;
        if (mode === 'equal') {
          inputInner = (
            <Text style={styles.inputLockedTxt}>{inputDisplayEqualPercent(i)}</Text>
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
            <TextInput
              value={fixedDollarStr[i] ?? ''}
              onChangeText={(t) => setDollarAt(i, t)}
              keyboardType="decimal-pad"
              style={styles.inputEditable}
              placeholder="0.00"
              placeholderTextColor={C.muted}
              accessibilityLabel={`${m.displayName} fixed amount`}
            />
          );
        }

        const rightAmount =
          mode === 'fixedDollar'
            ? fmtCents(rowCents[i] ?? 0)
            : fmtCents(rowCents[i] ?? 0);

        return (
          <View key={m.memberId} style={[styles.splitRow, isLast && styles.splitRowLast]}>
            <View style={[styles.splitAv, m.avatarUrl ? styles.splitAvPhoto : { backgroundColor: m.avatarBg }]}>
              {m.avatarUrl ? (
                <Image
                  source={{ uri: m.avatarUrl }}
                  style={styles.splitAvImg}
                  accessibilityLabel={m.displayName}
                />
              ) : (
                <Text style={[styles.splitAvTxt, { color: m.avatarColor }]}>{m.initials}</Text>
              )}
            </View>
            <Text style={styles.splitName} numberOfLines={1}>
              {m.displayName}
            </Text>
            <View style={[styles.inputShell, locked && styles.inputShellLocked]}>{inputInner}</View>
            <Text style={styles.splitAmount} numberOfLines={1}>
              {rightAmount}
            </Text>
          </View>
        );
      })}

      {validationBarVisible ? (
        <View
          style={[
            styles.pctTotal,
            customValid ? styles.pctOk : styles.pctBad,
          ]}
        >
          <Text style={[styles.pctBarTxt, customValid ? styles.pctOkTxt : styles.pctBadTxt]}>
            {customValid
              ? 'Total: 100% ✓'
              : `Total: ${Number.isFinite(customSum) ? `${customSum.toFixed(2).replace(/\.?0+$/, '')}%` : '—'}`}
          </Text>
          <Text style={[styles.pctBarTxt, customValid ? styles.pctOkTxt : styles.pctBadTxt]}>
            {customValid ? `${fmtCents(totalCents)} ✓` : 'Must equal 100%'}
          </Text>
        </View>
      ) : null}

      <View style={styles.editorActions}>
        <Pressable
          style={[styles.cancelEditorBtn, saving && styles.btnDisabled]}
          onPress={onCancel}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelEditorTxt}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[
            styles.saveEditorBtn,
            (saveDisabled || saving) && styles.saveEditorBtnDisabled,
          ]}
          onPress={requestSave}
          disabled={saveDisabled || saving}
          accessibilityRole="button"
          accessibilityLabel="Save split for next billing cycle"
          accessibilityState={{ disabled: saveDisabled || saving }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveEditorTxt}>
            Save{' '}
            <Text style={styles.saveEditorSubTxt}>· effective next cycle</Text>
          </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
    backgroundColor: '#FAFAF8',
  },
  seHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  seTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  seMethod: {
    flexDirection: 'row',
    backgroundColor: '#F0EEE9',
    borderRadius: 8,
    padding: 2,
    gap: 2,
    flex: 1,
    minWidth: 160,
    justifyContent: 'space-between',
  },
  seOpt: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  seOptOn: {
    backgroundColor: '#fff',
  },
  seOptTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  seOptTxtOn: {
    color: C.purple,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F5F3EE',
  },
  splitRowLast: {
    borderBottomWidth: 0,
  },
  splitAv: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  splitAvPhoto: {
    backgroundColor: '#E8E6E1',
  },
  splitAvImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  splitAvTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  splitName: {
    flex: 1,
    fontSize: 18,
    color: C.text,
    minWidth: 0,
  },
  inputShell: {
    width: 84,
    backgroundColor: '#F0EEE9',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    justifyContent: 'center',
    minHeight: 42,
  },
  inputShellLocked: {
    opacity: 0.95,
  },
  inputLockedTxt: {
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
    textAlign: 'center',
  },
  inputEditable: {
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  splitAmount: {
    width: 76,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
  },
  pctTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  pctOk: {
    backgroundColor: '#E1F5EE',
  },
  pctBad: {
    backgroundColor: '#FCEBEB',
  },
  pctBarTxt: {
    fontSize: 16,
    fontWeight: '600',
  },
  pctOkTxt: {
    color: C.greenDark,
  },
  pctBadTxt: {
    color: '#A32D2D',
  },
  editorActions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 12,
  },
  cancelEditorBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F0EEE9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditorTxt: {
    fontSize: 18,
    fontWeight: '500',
    color: '#5F5E5A',
  },
  saveEditorBtn: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: C.purple,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveEditorBtnDisabled: {
    opacity: 0.42,
  },
  saveEditorTxt: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  saveEditorSubTxt: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.75)',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
