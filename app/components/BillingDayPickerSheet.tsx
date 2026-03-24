import React, { useCallback, useEffect, useMemo, useState } from 'react';
;
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { clampDayToMonth } from '../../lib/billingDayFormat';

const C = {
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  sheetBg: '#F2F0EB',
  white: '#fff',
  border: 'rgba(0,0,0,0.08)',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type CalendarCell = { type: 'pad' } | { type: 'day'; day: number };

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type BillingDayPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  billingCycle: 'monthly' | 'yearly';
  /** Day 1–31 and month 0–11 used to build the initial calendar selection. */
  initialDay: number;
  initialMonthIndex: number;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function BillingDayPickerSheet({
  visible,
  onClose,
  onConfirm,
  billingCycle,
  initialDay,
  initialMonthIndex,
}: BillingDayPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const now = new Date();
  const baseYear = now.getFullYear();

  const seedDate = useMemo(() => {
    const d = clampDayToMonth(baseYear, initialMonthIndex, initialDay);
    return new Date(baseYear, initialMonthIndex, d);
  }, [baseYear, initialDay, initialMonthIndex]);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(seedDate));
  const [selectedDate, setSelectedDate] = useState(() => seedDate);

  useEffect(() => {
    if (!visible) return;
    const d = clampDayToMonth(baseYear, initialMonthIndex, initialDay);
    const next = new Date(baseYear, initialMonthIndex, d);
    setViewMonth(startOfMonth(next));
    setSelectedDate(next);
  }, [visible, baseYear, initialDay, initialMonthIndex]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const rows = useMemo(() => {
    const list: CalendarCell[] = [];
    for (let i = 0; i < firstDow; i++) list.push({ type: 'pad' });
    for (let d = 1; d <= daysInMonth; d++) list.push({ type: 'day', day: d });
    const out: CalendarCell[][] = [];
    for (let i = 0; i < list.length; i += 7) {
      const chunk = list.slice(i, i + 7);
      while (chunk.length < 7) chunk.push({ type: 'pad' });
      out.push(chunk);
    }
    return out;
  }, [firstDow, daysInMonth]);

  const goPrevMonth = useCallback(() => {
    setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() - 1, 1));
  }, []);

  const goNextMonth = useCallback(() => {
    setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() + 1, 1));
  }, []);

  const onPickDay = useCallback(
    (day: number) => {
      const d = clampDayToMonth(year, month, day);
      setSelectedDate(new Date(year, month, d));
    },
    [year, month],
  );

  const onConfirmPress = useCallback(() => {
    onConfirm(selectedDate);
    onClose();
  }, [onConfirm, onClose, selectedDate]);

  const title =
    billingCycle === 'yearly'
      ? 'Renewal date'
      : 'Billing day';

  const subtitle =
    billingCycle === 'yearly'
      ? 'Choose the month and day you are charged each year.'
      : 'Choose a date — only the day of the month is used for monthly billing.';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close calendar"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetSub}>{subtitle}</Text>

          <View style={styles.monthRow}>
            <Pressable
              onPress={goPrevMonth}
              style={styles.monthNav}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color={C.purple} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {MONTH_NAMES[month]} {year}
            </Text>
            <Pressable
              onPress={goNextMonth}
              style={styles.monthNav}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color={C.purple} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={styles.weekCell}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {rows.map((row, ri) => (
              <View key={`row-${ri}`} style={styles.gridRow}>
                {row.map((cell, ci) => {
                  const idx = ri * 7 + ci;
                  if (cell.type === 'pad') {
                    return <View key={`pad-${idx}`} style={styles.dayCell} />;
                  }
                  const cellDate = new Date(year, month, cell.day);
                  const sel = sameCalendarDay(cellDate, selectedDate);
                  return (
                    <Pressable
                      key={`d-${cell.day}`}
                      onPress={() => onPickDay(cell.day)}
                      style={styles.dayCell}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={`${MONTH_NAMES[month]} ${cell.day}`}
                    >
                      <View style={[styles.dayInner, sel && styles.dayInnerSelected]}>
                        <Text style={[styles.dayTxt, sel && styles.dayTxtSelected]}>{cell.day}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Pressable
            onPress={onConfirmPress}
            style={({ pressed }) => [styles.confirmBtn, pressed && styles.confirmBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Confirm billing date"
          >
            <Text style={styles.confirmBtnTxt}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.sheetBg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '88%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  sheetSub: {
    fontSize: 14,
    color: C.muted,
    marginTop: 6,
    lineHeight: 20,
    marginBottom: 16,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNav: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  grid: {
    marginBottom: 20,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: CELL,
  },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInnerSelected: {
    backgroundColor: C.purple,
  },
  dayTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  dayTxtSelected: {
    color: C.white,
  },
  confirmBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnPressed: {
    opacity: 0.92,
  },
  confirmBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: C.white,
  },
});
