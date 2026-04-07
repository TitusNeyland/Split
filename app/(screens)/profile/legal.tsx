import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileLegalScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header />
      <View style={styles.content}>
        <LegalRow
          label="Terms of Service"
          onPress={() => router.push({ pathname: '/profile/legal-document', params: { doc: 'terms' } })}
        />
        <LegalRow
          label="Privacy Policy"
          onPress={() => router.push({ pathname: '/profile/legal-document', params: { doc: 'privacy' } })}
        />
        <LegalRow
          label="Refund Policy"
          onPress={() => router.push({ pathname: '/profile/legal-document', params: { doc: 'refund' } })}
        />
      </View>
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color="#534AB7" />
      </Pressable>
      <Text style={styles.headerTitle}>Legal</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function LegalRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress} accessibilityRole="button">
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#C4C2BC" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a18',
  },
  content: {
    paddingHorizontal: 20,
  },
  row: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a18',
  },
});
