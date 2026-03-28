import React, { useCallback, useState } from 'react';
;
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'How do I split a receipt?',
    a: 'Scan or upload a receipt from the Scan tab, confirm line items, then choose who owes what and send a request.',
  },
  {
    q: 'How do payments work?',
    a: 'Payment methods you save are processed securely. Friends pay their share based on the split you set.',
  },
  {
    q: 'Can I edit a split after I send it?',
    a: 'Yes, when your split preferences allow changes. Some updates may apply on the next billing cycle.',
  },
  {
    q: 'How do I contact support?',
    a: 'Use Contact support on your profile to email us, or report a payment issue for billing problems.',
  },
];

export default function ProfileFaqScreen() {
  const insets = useSafeAreaInsets();
  const [openId, setOpenId] = useState<number | null>(0);

  const toggle = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((prev) => (prev === index ? null : index));
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color="#534AB7" />
        </Pressable>
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={{ width: 26 }} />
      </View>

      <Text style={styles.lead}>Common questions about mySplit.</Text>

      {FAQ_ITEMS.map((item, i) => {
        const open = openId === i;
        return (
          <Pressable
            key={item.q}
            onPress={() => toggle(i)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
          >
            <View style={styles.cardRow}>
              <Text style={styles.q}>{item.q}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#534AB7" />
            </View>
            {open ? <Text style={styles.a}>{item.a}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
  },
  lead: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  q: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a18',
  },
  a: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#555',
  },
});
