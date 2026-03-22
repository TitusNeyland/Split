import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { fmtCents } from '../../lib/addSubscriptionSplitMath';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
};

type ReviewMember = {
  memberId: string;
  displayName: string;
  role: 'owner' | 'member';
  percent: number;
  amountCents: number;
};

/** Step 4 — review & confirm (placeholder until spec arrives). */
export default function AddSubscriptionReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    planName?: string;
    totalCents?: string;
    membersReviewJson?: string;
    splitMethod?: string;
  }>();

  const planName = typeof params.planName === 'string' ? params.planName.trim() : '';
  const totalCents =
    typeof params.totalCents === 'string' ? parseInt(params.totalCents, 10) : 0;
  const splitMethod = typeof params.splitMethod === 'string' ? params.splitMethod : '';

  const members = useMemo((): ReviewMember[] => {
    const raw = params.membersReviewJson;
    if (typeof raw !== 'string' || raw === '') return [];
    try {
      const decoded = decodeURIComponent(raw);
      const data = JSON.parse(decoded) as { members?: ReviewMember[] };
      return Array.isArray(data.members) ? data.members : [];
    } catch {
      return [];
    }
  }, [params.membersReviewJson]);

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
          accessibilityLabel="Back to split setup"
        >
          <Ionicons name="chevron-back" size={26} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backLbl}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Review split</Text>
        <Text style={styles.sub}>Step 4 UI will go here</Text>
        <View style={styles.progWrap}>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: '95%' }]} />
          </View>
          <Text style={styles.progLabel}>Step 4 of 4</Text>
        </View>
      </LinearGradient>

      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>{planName || 'Plan'}</Text>
        <Text style={styles.meta}>
          Total {fmtCents(Number.isFinite(totalCents) ? totalCents : 0)} · {splitMethod || '—'}
        </Text>
        <Text style={styles.meta}>{members.length} member(s) in split</Text>
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
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  hint: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
    marginBottom: 8,
  },
  meta: {
    fontSize: 15,
    color: C.muted,
    marginBottom: 6,
  },
});
