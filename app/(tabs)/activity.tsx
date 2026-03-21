import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
};

type ActivityFilterId = 'all' | 'received' | 'pending' | 'failed' | 'audit' | 'receipts';

const FILTER_PILLS: {
  id: ActivityFilterId;
  label: string;
  dotColor: string | null;
}[] = [
  { id: 'all', label: 'All', dotColor: null },
  { id: 'received', label: 'Received', dotColor: '#4ade80' },
  { id: 'pending', label: 'Pending', dotColor: '#fbbf24' },
  { id: 'failed', label: 'Failed', dotColor: '#f87171' },
  { id: 'audit', label: 'Changes', dotColor: '#a78bfa' },
  { id: 'receipts', label: 'Receipts', dotColor: '#93c5fd' },
];

const PANEL_COPY: Record<
  ActivityFilterId,
  { title: string; body: string }
> = {
  all: {
    title: 'All activity',
    body: 'Full feed of payments, pending items, and updates appears here.',
  },
  received: {
    title: 'This month',
    body: 'Money collected from shared subscriptions and manual marks.',
  },
  pending: {
    title: 'Waiting on',
    body: 'Overdue and partial payments you are still owed.',
  },
  failed: {
    title: 'Needs attention',
    body: 'Failed charges and retries that need a follow-up.',
  },
  audit: {
    title: 'All changes',
    body: 'Split edits, price updates, and group audit events.',
  },
  receipts: {
    title: 'Receipt splits',
    body: 'Scanned bills and who still owes on each receipt.',
  },
};

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ActivityFilterId>('all');

  const collectedDisplay = useMemo(() => '+$47.50', []);
  const trendDisplay = useMemo(() => '↑ $12 vs last month', []);
  const pendingCount = 3;
  const pendingBreakdown = '1 overdue · 1 partial';

  const panel = PANEL_COPY[filter];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <LinearGradient
          colors={['#6B3FA0', '#4A1570', '#2D0D45']}
          locations={[0, 0.6, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={[
            styles.hero,
            {
              paddingTop: Math.max(insets.top, 12) + 4,
            },
          ]}
        >
          <View style={styles.sbar}>
            <Text style={styles.pageTitle}>Activity</Text>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Search activity"
            >
              <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.hstat}>
              <Text style={styles.hstatValGreen}>{collectedDisplay}</Text>
              <Text style={styles.hstatLbl}>Collected this month</Text>
              <Text style={styles.hstatSubGreen}>{trendDisplay}</Text>
            </View>
            <View style={styles.hstat}>
              <Text style={styles.hstatValWhite}>{pendingCount}</Text>
              <Text style={styles.hstatLbl}>Pending payments</Text>
              <Text style={styles.hstatSubAmber}>{pendingBreakdown}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTER_PILLS.map((p) => {
              const active = filter === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setFilter(p.id)}
                  style={[styles.fpill, active ? styles.fpillOn : styles.fpillOff]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  {p.dotColor ? (
                    <View style={[styles.fpillDot, { backgroundColor: p.dotColor }]} />
                  ) : null}
                  <Text style={[styles.fpillText, active ? styles.fpillTextOn : styles.fpillTextOff]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.panelCard}>
            <Text style={styles.panelEyebrow}>{panel.title}</Text>
            <Text style={styles.panelBody}>{panel.body}</Text>
          </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  sbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.35,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  hstat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 16,
    minHeight: 100,
    justifyContent: 'center',
  },
  hstatValGreen: {
    fontSize: 28,
    fontWeight: '600',
    color: '#86efac',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  hstatValWhite: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  hstatLbl: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 16,
  },
  hstatSubGreen: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 5,
    color: 'rgba(134,239,172,0.8)',
    lineHeight: 16,
  },
  hstatSubAmber: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 5,
    color: 'rgba(251,191,36,0.9)',
    lineHeight: 16,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
    paddingBottom: 4,
  },
  fpill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 17,
    minHeight: 44,
  },
  fpillOn: {
    backgroundColor: '#fff',
  },
  fpillOff: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fpillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fpillText: {
    fontSize: 15,
    fontWeight: '500',
  },
  fpillTextOn: {
    color: '#534AB7',
  },
  fpillTextOff: {
    color: 'rgba(255,255,255,0.7)',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  panelCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  panelEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  panelBody: {
    fontSize: 14,
    color: '#1a1a18',
    lineHeight: 20,
  },
});
