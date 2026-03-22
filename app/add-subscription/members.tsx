import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
};

/** Step 3 — members & split (placeholder until spec arrives). */
export default function AddSubscriptionMembersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { planName } = useLocalSearchParams<{ planName?: string }>();
  const title = typeof planName === 'string' && planName.trim() ? planName.trim() : 'Split';

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
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backLbl}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Who's splitting?</Text>
        <Text style={styles.sub}>Step 3 UI will go here</Text>
        <View style={styles.progWrap}>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: '75%' }]} />
          </View>
          <Text style={styles.progLabel}>Step 3 of 4</Text>
        </View>
      </LinearGradient>

      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>Plan: {title}</Text>
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
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  backLbl: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  title: {
    fontSize: 21,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
  },
  progWrap: {
    marginTop: 14,
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
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 5,
  },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  hint: {
    fontSize: 15,
    color: C.muted,
  },
});
