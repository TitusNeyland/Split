import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const C = {
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
};

/** Placeholder for Step 2 — replaced when you send the details screen spec. */
export default function AddSubscriptionDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { serviceName, iconColor, priceSuggestionCents } = useLocalSearchParams<{
    serviceName?: string;
    iconColor?: string;
    priceSuggestionCents?: string;
  }>();

  const name = typeof serviceName === 'string' ? serviceName : '';
  const color = typeof iconColor === 'string' ? iconColor : '#EEEDFE';
  const cents =
    typeof priceSuggestionCents === 'string' && priceSuggestionCents !== ''
      ? parseInt(priceSuggestionCents, 10)
      : NaN;
  const priceLine =
    Number.isFinite(cents) && cents >= 0 ? `Suggested from $${(cents / 100).toFixed(2)}` : 'No price suggestion';

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
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backLbl}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Details</Text>
        <Text style={styles.sub}>Step 2 UI will go here</Text>
      </LinearGradient>

      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>Carried forward from Step 1:</Text>
        <View style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text style={styles.val}>{name || '—'}</Text>
        </View>
        <Text style={styles.meta}>{priceLine}</Text>
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
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  hint: {
    fontSize: 15,
    color: C.muted,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: 11,
  },
  val: {
    fontSize: 19,
    fontWeight: '600',
    color: C.text,
    flex: 1,
  },
  meta: {
    fontSize: 17,
    color: C.muted,
    marginTop: 10,
  },
});
