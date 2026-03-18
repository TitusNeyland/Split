import React from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../../constants/theme';

const upcomingSplits = [
  {
    id: 'netflix',
    name: 'Netflix Premium',
    members: 3,
    inDays: 2,
    total: 22.99,
    status: 'you owe $12',
    statusColor: '#E24B4A',
    iconBg: '#E1F5EE',
    iconEmoji: '📺',
  },
  {
    id: 'spotify',
    name: 'Spotify Family',
    members: 5,
    inDays: 9,
    total: 16.99,
    status: 'owed $13.60',
    statusColor: '#1D9E75',
    iconBg: '#EEEDFE',
    iconEmoji: '🎵',
  },
  {
    id: 'xbox',
    name: 'Xbox Game Pass',
    members: 2,
    inDays: 15,
    total: 14.99,
    status: 'owed $7.50',
    statusColor: '#1D9E75',
    iconBg: '#FAECE7',
    iconEmoji: '🎮',
  },
];

const recentActivity = [
  {
    id: '1',
    title: 'Alex paid Spotify',
    subtitle: '2 min ago',
    amount: '+$3.40',
    amountColor: '#1D9E75',
    iconBg: '#E1F5EE',
    iconType: 'check',
  },
  {
    id: '2',
    title: 'Reminder sent to Sam',
    subtitle: 'Netflix · 1 hr ago',
    amount: '$5.33',
    amountColor: '#EF9F27',
    iconBg: '#FAEEDA',
    iconType: 'bell',
  },
  {
    id: '3',
    title: 'Taylor paid Xbox',
    subtitle: 'Yesterday',
    amount: '+$7.50',
    amountColor: '#1D9E75',
    iconBg: '#E1F5EE',
    iconType: 'check',
  },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>Welcome back, Titus</Text>
            <View style={styles.notifPill}>
              <Text style={styles.notifPillText}>2</Text>
            </View>
          </View>

          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroLabel}>You&apos;re owed this month</Text>
              <Text style={styles.heroAmount}>$47.50</Text>
            </View>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>$12 more{'\n'}than last month</Text>
            </View>
          </View>

          <View style={styles.heroSparklinePlaceholder} />
        </View>

        {/* White hero card with three rows */}
        <View style={styles.heroCard}>
          <View style={styles.heroCardRow}>
            <View style={[styles.heroCardIcon, { backgroundColor: '#FCEBEB' }]} />
            <View style={styles.heroCardTextBlock}>
              <Text style={styles.heroCardTitle}>You owe</Text>
              <Text style={styles.heroCardSubtitle}>Netflix · due in 2 days</Text>
            </View>
            <View style={styles.heroCardRight}>
              <Text style={[styles.heroCardAmount, { color: '#E24B4A' }]}>$12.00</Text>
              <Text style={styles.heroCardDetail}>tap to pay</Text>
            </View>
          </View>

          <View style={styles.heroCardRow}>
            <View style={[styles.heroCardIcon, { backgroundColor: '#E1F5EE' }]} />
            <View style={styles.heroCardTextBlock}>
              <Text style={styles.heroCardTitle}>Pending from 3 people</Text>
              <Text style={styles.heroCardSubtitle}>Spotify, Xbox, iCloud</Text>
            </View>
            <View style={styles.heroCardRight}>
              <Text style={[styles.heroCardAmount, { color: '#1D9E75' }]}>$47.50</Text>
              <Text style={styles.heroCardDetail}>view all</Text>
            </View>
          </View>

          <View style={styles.heroCardRow}>
            <View style={[styles.heroCardIcon, { backgroundColor: '#EEEDFE' }]} />
            <View style={styles.heroCardTextBlock}>
              <Text style={styles.heroCardTitle}>Scan a receipt</Text>
              <Text style={styles.heroCardSubtitle}>Split your last dinner</Text>
            </View>
          </View>
        </View>

        {/* Dots */}
        <View style={styles.dotsRow}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        {/* Upcoming splits */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Upcoming splits</Text>
          <Text style={styles.sectionAction}>See all</Text>
        </View>
        <View style={styles.card}>
          <FlatList
            data={upcomingSplits}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.subRow}>
                <View style={[styles.subIcon, { backgroundColor: item.iconBg }]}>
                  <Text style={styles.subIconEmoji}>{item.iconEmoji}</Text>
                </View>
                <View style={styles.subTextBlock}>
                  <Text style={styles.subName}>{item.name}</Text>
                  <Text style={styles.subMeta}>
                    {item.members} members · in {item.inDays} days
                  </Text>
                </View>
                <View style={styles.subRight}>
                  <Text style={styles.subAmount}>${item.total.toFixed(2)}</Text>
                  <Text style={[styles.subStatus, { color: item.statusColor }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>

        {/* Recent activity */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Recent activity</Text>
          <Text style={styles.sectionAction}>See all</Text>
        </View>
        <View style={styles.card}>
          <FlatList
            data={recentActivity}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.activityRow}>
                <View style={[styles.activityIcon, { backgroundColor: item.iconBg }]}>
                  <View style={styles.activityIconInner} />
                </View>
                <View style={styles.activityTextBlock}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
                </View>
                <Text style={[styles.activityAmount, { color: item.amountColor }]}>
                  {item.amount}
                </Text>
              </View>
            )}
          />
        </View>

        {/* Setup card */}
        <View style={styles.setupCard}>
          <View style={styles.setupTopRow}>
            <Text style={styles.setupLabel}>Complete setup (2/7)</Text>
            <Text style={styles.setupAction}>Continue →</Text>
          </View>
          <View style={styles.setupTrack}>
            <View style={styles.setupFill} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: -30,
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl * 2.8,
    paddingBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: '500',
  },
  notifPill: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E24B4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifPillText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: '600',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: typography.sizes.xs,
    marginBottom: spacing.xs,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '500',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
  },
  heroBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
    marginRight: 6,
  },
  heroBadgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: typography.sizes.xs,
    textAlign: 'right',
  },
  heroSparklinePlaceholder: {
    marginTop: spacing.md,
    height: 72,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginHorizontal: 14,
    marginTop: -22,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  heroCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0EEE9',
  },
  heroCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  heroCardTextBlock: {
    flex: 1,
    marginLeft: 12,
  },
  heroCardTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: '#1a1a18',
  },
  heroCardSubtitle: {
    fontSize: typography.sizes.xs,
    color: '#888780',
    marginTop: 2,
  },
  heroCardRight: {
    alignItems: 'flex-end',
  },
  heroCardAmount: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
  },
  heroCardDetail: {
    fontSize: typography.sizes.xs,
    color: '#888780',
    marginTop: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D3D1C7',
    marginHorizontal: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: '#534AB7',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: '#888780',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  sectionAction: {
    fontSize: typography.sizes.sm,
    color: '#534AB7',
    fontWeight: '500',
  },
  card: {
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F5F3EE',
  },
  subIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subIconEmoji: {
    fontSize: 16,
  },
  subTextBlock: {
    flex: 1,
    marginLeft: 10,
  },
  subName: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: '#1a1a18',
  },
  subMeta: {
    fontSize: typography.sizes.xs,
    color: '#888780',
    marginTop: 2,
  },
  subRight: {
    alignItems: 'flex-end',
  },
  subAmount: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: '#1a1a18',
  },
  subStatus: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F5F3EE',
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1D9E75',
  },
  activityTextBlock: {
    flex: 1,
    marginLeft: 10,
  },
  activityTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: '#1a1a18',
  },
  activitySubtitle: {
    fontSize: typography.sizes.xs,
    color: '#888780',
    marginTop: 2,
  },
  activityAmount: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
  },
  setupCard: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  setupTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  setupLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: '#1a1a18',
  },
  setupAction: {
    fontSize: typography.sizes.sm,
    color: '#534AB7',
    fontWeight: '500',
  },
  setupTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F0EEE9',
    overflow: 'hidden',
  },
  setupFill: {
    width: '28%',
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#534AB7',
  },
});

export {};

