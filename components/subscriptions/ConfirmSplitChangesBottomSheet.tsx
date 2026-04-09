import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatUsdFromCents } from '../../lib/format/currency';

const C = {
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  green: '#1D9E75',
  red: '#E24B4A',
  bg: '#F2F0EB',
  divider: '#F0EEE9',
  white: '#fff',
};

export type ConfirmSplitChangeRow = {
  /** "Jane's share" or "Percentage change" or "Member removed" etc */
  label: string;
  /** Old value (optional) */
  oldValue?: string;
  /** New value */
  newValue: string;
  /** Optional variant color */
  variant?: 'neutral' | 'warning' | 'removed';
};

export type ConfirmSplitChangesProps = {
  isVisible: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  changes: ConfirmSplitChangeRow[];
  effectiveMessage?: string; // e.g. "Changes will take effect next cycle"
  confirmButtonLabel?: string;
  loading?: boolean;
};

export function ConfirmSplitChangesBottomSheet({
  isVisible,
  onConfirm,
  onCancel,
  title = 'Confirm split changes',
  subtitle,
  changes,
  effectiveMessage,
  confirmButtonLabel = 'Confirm changes',
  loading = false,
}: ConfirmSplitChangesProps) {
  const insets = useSafeAreaInsets();

  const changeItems = useMemo(() => {
    return changes.filter((c) => c.newValue !== undefined);
  }, [changes]);

  if (!isVisible) {
    return null;
  }

  return (
    <View style={styles.backdrop}>
      <Pressable style={styles.overlay} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {/* Changes list */}
        <ScrollView style={styles.changesList} showsVerticalScrollIndicator={false}>
          {changeItems.length > 0 ? (
            <>
              <Text style={styles.changesHeader}>Changes:</Text>
              {changeItems.map((change, idx) => (
                <View key={`${idx}-${change.label}`} style={styles.changeRow}>
                  <View style={styles.changeRowLeft}>
                    <Text style={[styles.changeLabel, change.variant === 'removed' && styles.removedLabel]}>
                      {change.label}
                    </Text>
                    {change.oldValue && (
                      <View style={styles.changeValues}>
                        <Text style={[styles.changeValue, styles.oldValue]}>{change.oldValue}</Text>
                        <Ionicons name="arrow-forward" size={14} color={C.muted} style={styles.arrow} />
                        <Text style={[styles.changeValue, change.variant === 'removed' && styles.removedValue]}>
                          {change.newValue}
                        </Text>
                      </View>
                    )}
                    {!change.oldValue && (
                      <Text style={[styles.changeValue, change.variant === 'removed' && styles.removedValue]}>
                        {change.newValue}
                      </Text>
                    )}
                  </View>
                  {change.variant === 'removed' && (
                    <Ionicons name="close-circle" size={20} color={C.red} style={styles.removeIcon} />
                  )}
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.noChanges}>No changes detected</Text>
          )}

          {effectiveMessage && (
            <View style={styles.effectiveBox}>
              <Ionicons name="information-circle-outline" size={16} color={C.purple} />
              <Text style={styles.effectiveText}>{effectiveMessage}</Text>
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.cancelBtn]}
            onPress={onCancel}
            disabled={loading}
          >
            <Text style={styles.cancelBtnTxt}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.confirmBtn, loading && styles.btnDisabled]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Text style={styles.confirmBtnTxt}>Saving…</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={C.white} />
                <Text style={styles.confirmBtnTxt}>{confirmButtonLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: C.muted,
  },
  changesList: {
    flex: 1,
    marginBottom: 16,
  },
  changesHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: C.bg,
    borderRadius: 12,
  },
  changeRowLeft: {
    flex: 1,
  },
  changeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    marginBottom: 4,
  },
  removedLabel: {
    color: C.red,
  },
  changeValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeValue: {
    fontSize: 13,
    color: C.muted,
  },
  oldValue: {
    textDecorationLine: 'line-through',
  },
  removedValue: {
    color: C.red,
  },
  arrow: {
    marginHorizontal: 4,
  },
  removeIcon: {
    marginLeft: 12,
    marginTop: 2,
  },
  noChanges: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  effectiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: 'rgba(83, 74, 183, 0.08)',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.purple,
  },
  effectiveText: {
    flex: 1,
    fontSize: 12,
    color: C.text,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  cancelBtn: {
    backgroundColor: C.divider,
  },
  cancelBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  confirmBtn: {
    backgroundColor: C.purple,
  },
  confirmBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.white,
  },
});
