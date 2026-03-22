import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';

const C = {
  bg: '#F2F0EB',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F0EEE9',
  green: '#0F6E56',
  amber: '#854F0B',
};

type LineRow = {
  label: string;
  assignedTo: string;
  amount: string;
  status: 'Paid' | 'Pending';
};

type ReceiptDetail = {
  merchant: string;
  dateLabel: string;
  total: string;
  peopleCount: number;
  itemCount: number;
  lines: LineRow[];
};

const RECEIPT_DETAILS: Record<string, ReceiptDetail> = {
  m1: {
    merchant: 'Olive Garden',
    dateLabel: 'Mar 14 · 7:42 PM',
    total: '$49.52',
    peopleCount: 3,
    itemCount: 7,
    lines: [
      { label: 'Chicken Parm', assignedTo: 'Titus', amount: '$18.99', status: 'Paid' },
      { label: 'Fettuccine Alfredo', assignedTo: 'Alex', amount: '$16.99', status: 'Paid' },
      { label: 'Salad + soup', assignedTo: 'Sam', amount: '$13.54', status: 'Pending' },
    ],
  },
  m2: {
    merchant: 'Chipotle',
    dateLabel: 'Mar 14 · 12:10 PM',
    total: '$24.80',
    peopleCount: 2,
    itemCount: 4,
    lines: [
      { label: 'Burrito bowl', assignedTo: 'Titus', amount: '$12.40', status: 'Paid' },
      { label: 'Burrito + drink', assignedTo: 'Taylor', amount: '$12.40', status: 'Paid' },
    ],
  },
};

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const receiptId = typeof id === 'string' ? id : id?.[0] ?? '';

  const detail = useMemo(() => RECEIPT_DETAILS[receiptId], [receiptId]);

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Stack.Screen
          options={{
            title: 'Receipt',
            headerBackTitle: 'Activity',
          }}
        />
        <Text style={styles.unknownTitle}>Receipt not found</Text>
        <Text style={styles.unknownSub}>This receipt may have been removed.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: detail.merchant,
          headerBackTitle: 'Activity',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.merchant}>{detail.merchant}</Text>
        <Text style={styles.meta}>
          {detail.peopleCount} people · {detail.itemCount} items · {detail.dateLabel}
        </Text>
        <View style={styles.totalCard}>
          <Text style={styles.totalLbl}>Total</Text>
          <Text style={styles.totalVal}>{detail.total}</Text>
        </View>

        <Text style={styles.sectionTitle}>Line items</Text>
        <Text style={styles.sectionSub}>Who owes what and payment status</Text>

        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thItem]}>Item</Text>
            <Text style={[styles.th, styles.thPerson]}>Assigned</Text>
            <Text style={[styles.th, styles.thAmt]}>Share</Text>
            <Text style={[styles.th, styles.thStat]}>Status</Text>
          </View>
          {detail.lines.map((row, i) => (
            <View
              key={`${row.label}-${i}`}
              style={[styles.tr, i < detail.lines.length - 1 && styles.trBorder]}
            >
              <Text style={[styles.td, styles.thItem]} numberOfLines={2}>
                {row.label}
              </Text>
              <Text style={[styles.td, styles.thPerson]} numberOfLines={1}>
                {row.assignedTo}
              </Text>
              <Text style={[styles.td, styles.thAmt]}>{row.amount}</Text>
              <View style={styles.thStat}>
                <View
                  style={[
                    styles.statusPill,
                    row.status === 'Paid' ? styles.statusPaid : styles.statusPending,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusTxt,
                      row.status === 'Paid' ? styles.statusTxtPaid : styles.statusTxtPending,
                    ]}
                  >
                    {row.status}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  centered: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unknownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
  },
  unknownSub: {
    fontSize: 14,
    color: C.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  merchant: {
    fontSize: 22,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 13,
    color: C.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  totalCard: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLbl: {
    fontSize: 14,
    fontWeight: '500',
    color: C.muted,
  },
  totalVal: {
    fontSize: 20,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
  },
  sectionSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
    marginBottom: 10,
  },
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAF8',
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  th: {
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thItem: { flex: 1.4 },
  thPerson: { flex: 0.9 },
  thAmt: { flex: 0.75, textAlign: 'right' },
  thStat: { flex: 0.85, alignItems: 'flex-end' },
  tr: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  trBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  td: {
    fontSize: 13,
    color: C.text,
    fontWeight: '500',
  },
  statusPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusPaid: {
    backgroundColor: '#E1F5EE',
  },
  statusPending: {
    backgroundColor: '#FAEEDA',
  },
  statusTxt: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusTxtPaid: { color: C.green },
  statusTxtPending: { color: C.amber },
});
