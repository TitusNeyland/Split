import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

/**
 * Friends hub (full experience tracked separately). Entry point after accepting an invite.
 */
export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
        <View style={styles.heroTop}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backRow}
            accessibilityRole="button"
            accessibilityLabel="Back to Profile"
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.65)" />
            <Text style={styles.backLbl}>Profile</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/invite-share')}
            style={styles.invitePill}
            accessibilityRole="button"
            accessibilityLabel="Invite a friend"
          >
            <Text style={styles.invitePillTxt}>+ Invite</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Friends</Text>
        <Text style={styles.sub}>You’re connected — full list and balances ship next.</Text>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.placeholderCard}>
          <Ionicons name="people-outline" size={32} color="#534AB7" />
          <Text style={styles.placeholderTitle}>Friend list</Text>
          <Text style={styles.placeholderBody}>
            Search, pending invites, and balances will appear here in a follow-up.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backLbl: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  invitePill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
  },
  invitePillTxt: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
    lineHeight: 17,
  },
  body: {
    flex: 1,
    marginTop: -12,
  },
  placeholderCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a18',
  },
  placeholderBody: {
    fontSize: 13,
    color: '#888780',
    textAlign: 'center',
    lineHeight: 19,
  },
});
