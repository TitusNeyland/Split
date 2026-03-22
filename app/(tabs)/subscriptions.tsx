import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import {
  subscribeSubscriptionTabBadgeCounts,
  type SubscriptionTabBadgeCounts,
} from '../../lib/subscriptionTabBadgesFirestore';
import { spacing } from '../../constants/theme';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  red: '#E24B4A',
  text: '#1a1a18',
  muted: '#888780',
};

type FilterId = 'active' | 'overdue' | 'paused' | 'archived';

const FILTERS: { id: FilterId; label: string; badge?: 'overdue' | 'paused' }[] = [
  { id: 'active', label: 'Active' },
  { id: 'overdue', label: 'Overdue', badge: 'overdue' },
  { id: 'paused', label: 'Paused', badge: 'paused' },
  { id: 'archived', label: 'Archived' },
];

function formatBadgeCount(n: number): string {
  if (n > 99) return '99+';
  return String(n);
}

export default function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [user, setUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<FilterId>('active');
  const [badges, setBadges] = useState<SubscriptionTabBadgeCounts>({ overdue: 0, paused: 0 });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setBadges({ overdue: 0, paused: 0 });
      return;
    }
    return subscribeSubscriptionTabBadgeCounts(uid, setBadges);
  }, [user?.uid]);

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
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4 }]}
        >
          <View style={styles.sbar}>
            <Text style={styles.pageTitle}>Subscriptions</Text>
            <Pressable
              style={styles.addBtn}
              accessibilityRole="button"
              accessibilityLabel="Add subscription"
            >
              <Text style={styles.addBtnTxt}>+ Add</Text>
            </Pressable>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.hstat}>
              <Text style={styles.hstatVal}>$127</Text>
              <Text style={styles.hstatLbl}>Monthly total</Text>
            </View>
            <View style={styles.hstat}>
              <Text style={styles.hstatVal}>$28</Text>
              <Text style={styles.hstatLbl}>Your share</Text>
            </View>
            <View style={styles.hstat}>
              <Text style={styles.hstatVal}>4</Text>
              <Text style={styles.hstatLbl}>Active splits</Text>
            </View>
          </View>

          <View style={styles.seg}>
            {FILTERS.map((f) => {
              const selected = filter === f.id;
              const badgeCount =
                f.badge === 'overdue' ? badges.overdue : f.badge === 'paused' ? badges.paused : 0;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={[styles.segBtn, selected && styles.segBtnOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    f.badge && badgeCount > 0
                      ? `${f.label}, ${badgeCount} items`
                      : f.label
                  }
                >
                  <View style={styles.segBtnInner}>
                    <Text style={[styles.segBtnTxt, selected && styles.segBtnTxtOn]} numberOfLines={1}>
                      {f.label}
                    </Text>
                    {f.badge && badgeCount > 0 ? (
                      <View
                        style={[
                          styles.countPill,
                          f.badge === 'overdue' ? styles.countPillOverdue : styles.countPillPaused,
                        ]}
                      >
                        <Text style={styles.countPillTxt}>{formatBadgeCount(badgeCount)}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>

        <View style={[styles.body, { minHeight: Math.max(320, width * 0.9) }]}>
          {filter === 'active' ? (
            <View style={styles.panel}>
              <View style={styles.sh}>
                <Text style={styles.shTitle}>Active splits</Text>
                <Text style={styles.shAction}>Sort</Text>
              </View>
              <Text style={styles.panelHint}>Subscription cards will appear here.</Text>
            </View>
          ) : null}

          {filter === 'overdue' ? (
            <View style={styles.panel}>
              <View style={styles.sh}>
                <Text style={styles.shTitle}>Needs attention</Text>
              </View>
              <Text style={styles.panelHint}>Overdue splits will appear here.</Text>
            </View>
          ) : null}

          {filter === 'paused' ? (
            <View style={styles.panel}>
              <View style={styles.sh}>
                <Text style={styles.shTitle}>Paused</Text>
              </View>
              <Text style={styles.panelHint}>Paused subscriptions will appear here.</Text>
            </View>
          ) : null}

          {filter === 'archived' ? (
            <View style={styles.panel}>
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="archive-outline" size={30} color={C.muted} />
                </View>
                <Text style={styles.emptyTitle}>No archived subscriptions</Text>
                <Text style={styles.emptySub}>Cancelled subscriptions{'\n'}will appear here</Text>
              </View>
            </View>
          ) : null}
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
    paddingBottom: spacing.xl,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  addBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
  },
  addBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.purple,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  hstat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  hstatVal: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
    letterSpacing: -0.4,
  },
  hstatLbl: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    padding: 4,
    gap: 0,
  },
  segBtn: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  segBtnOn: {
    backgroundColor: '#fff',
  },
  segBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  segBtnTxt: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  segBtnTxtOn: {
    color: C.purple,
  },
  countPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillOverdue: {
    backgroundColor: C.red,
  },
  countPillPaused: {
    backgroundColor: '#8A8984',
  },
  countPillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 80,
    flexGrow: 1,
  },
  panel: {
    paddingTop: 4,
  },
  sh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
  },
  shTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  shAction: {
    fontSize: 16,
    color: C.purple,
    fontWeight: '500',
  },
  panelHint: {
    fontSize: 17,
    color: C.muted,
    lineHeight: 24,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: C.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
