import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqItem = { q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const CONTACT_EMAIL = 'support@getkilo.app';
const CONTACT_SUBJECT = 'Kilo Support Request';

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What is Kilo and how does it work?',
        a: 'Kilo helps people split shared subscription costs with friends, roommates, or teams. Create a split, invite members, and everyone is charged for their share based on the setup.',
      },
      {
        q: 'Is Kilo free to use?',
        a: 'Yes, there is a free plan for core splitting features. Paid plans unlock extra controls, advanced support options, and team workflows.',
      },
      {
        q: "What's the difference between Free, Pro, and Business plans?",
        a: 'Free covers basic subscription splitting, Pro adds more controls and convenience features, and Business is designed for teams that need multi-user management and advanced controls.',
      },
      {
        q: 'How do I add my first subscription split?',
        a: 'From the Subscriptions flow, add a subscription, choose how to split the cost, then invite members. Your split becomes active once it is created and invitations are sent.',
      },
      {
        q: 'Can I use Kilo without a payment method?',
        a: 'You can browse parts of the app and set up some details, but a payment method is typically required for live auto-charge splits and billing features.',
      },
    ],
  },
  {
    title: 'Splitting subscriptions',
    items: [
      {
        q: 'How do I invite someone to a split?',
        a: 'Open the split setup or split details, choose members, and send an invite from your contacts or by link.',
      },
      {
        q: "What happens when I invite someone who isn't on Kilo yet?",
        a: 'They receive an invite link and can join after creating an account. The split invitation remains pending until they accept.',
      },
      {
        q: "Can I split a subscription with someone I don't know personally?",
        a: 'Yes, but only split with people you trust. You are still responsible for your account and any costs you agree to cover.',
      },
      {
        q: 'How many people can be on a split?',
        a: 'It depends on your plan and product limits. The app enforces the active member cap during setup.',
      },
      {
        q: 'What happens if someone declines my invite?',
        a: 'Their seat stays unfilled and they are not charged. You can invite someone else or update the split setup.',
      },
      {
        q: 'Can I change the split percentages after the split is created?',
        a: 'Yes, in most cases you can edit shares in split settings. Changes may apply immediately or starting with the next billing cycle based on status.',
      },
      {
        q: 'How do I remove someone from a split?',
        a: 'Open the split, manage members, select the person, and remove them. Their future charges stop after removal according to cycle timing.',
      },
      {
        q: "What does 'You are covering the full cost until members accept' mean?",
        a: 'It means you temporarily carry 100% of the subscription amount while invites are still pending, then shares rebalance once members accept.',
      },
      {
        q: 'Can I leave a split I joined?',
        a: 'Yes, you can leave from split settings. Your share ends based on the split rules and billing period timing.',
      },
      {
        q: 'What happens when I end a split?',
        a: 'Ending a split stops future shared billing for members and closes the split for upcoming cycles.',
      },
    ],
  },
  {
    title: 'Payments & billing',
    items: [
      {
        q: 'How does auto-charge work?',
        a: 'When auto-charge is enabled, Kilo charges each member\'s saved payment method for their share at the scheduled billing time.',
      },
      {
        q: 'What payment methods are supported?',
        a: 'Supported methods appear in your payment settings and can vary by region and platform.',
      },
      {
        q: 'When does my share get charged?',
        a: 'Your charge timing is tied to the split billing schedule and can also depend on invitation acceptance and cycle start timing.',
      },
      {
        q: 'What happens if my payment fails?',
        a: 'Kilo marks it as failed, may retry automatically, and can notify you to update your method or pay manually.',
      },
      {
        q: 'Can I pay my share manually instead of using auto-charge?',
        a: 'Yes, if manual payment is enabled for that split. You can complete payment directly in the split payment flow.',
      },
      {
        q: 'How do I mark a payment as paid outside the app (e.g. Venmo, Zelle)?',
        a: 'Use the payment action for that split and choose the option to mark as paid outside Kilo, then confirm the record.',
      },
      {
        q: "What does 'overdue' mean?",
        a: 'Overdue means your payment due date passed and the amount is still outstanding.',
      },
      {
        q: 'Can I get a refund for a charge?',
        a: 'Refund eligibility depends on charge status and policy. Contact support with charge details for review.',
      },
    ],
  },
  {
    title: 'Notifications & reminders',
    items: [
      {
        q: 'Why am I getting reminders?',
        a: 'Reminders help prevent missed payments and keep split members aware of pending actions.',
      },
      {
        q: 'How do I turn off notifications?',
        a: 'Go to your Profile notification settings and adjust reminder or push preferences.',
      },
      {
        q: 'Can I set up automatic reminders for people who owe me?',
        a: 'Yes, reminder automation can be enabled in split or notification settings where available.',
      },
    ],
  },
  {
    title: 'Account & profile',
    items: [
      {
        q: 'How do I change my name or email?',
        a: 'Open Profile and use Edit to update your account details.',
      },
      {
        q: 'How do I reset my password?',
        a: 'Use the Forgot password flow on the sign-in screen and follow the reset instructions.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Use account settings if available, or contact support to request account deletion.',
      },
      {
        q: 'What happens to my splits if I delete my account?',
        a: 'Your membership is removed and active splits may rebalance or require owners to replace your share.',
      },
      {
        q: 'Is my payment information secure?',
        a: 'Yes. Payment details are handled by secure payment infrastructure and are not stored as raw card data in the app.',
      },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      {
        q: "Why can't I see a split I was invited to?",
        a: 'Check that you are signed into the same email or phone account that received the invite, then refresh and reopen the app.',
      },
      {
        q: 'Why does my activity feed show an old invite for a split I already joined?',
        a: 'Activity events are historical records and may remain visible even after you join.',
      },
      {
        q: 'Why are my monthly total and my share showing the same number?',
        a: 'This usually means you are currently covering the full amount, often while other members are still pending.',
      },
      {
        q: 'I got a permissions error when tapping Join — what do I do?',
        a: 'Make sure the invite is still valid, your app is up to date, and you are signed into the intended account. If it persists, contact support.',
      },
      {
        q: 'The app is showing wrong amounts. What should I do?',
        a: 'Pull to refresh, confirm split percentages and billing cycle details, then contact support with screenshots if the issue remains.',
      },
    ],
  },
];

export default function ProfileFaqScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return FAQ_SECTIONS;
    return FAQ_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const q = item.q.toLowerCase();
        const a = item.a.toLowerCase();
        return q.includes(normalizedQuery) || a.includes(normalizedQuery);
      }),
    })).filter((section) => section.items.length > 0);
  }, [normalizedQuery]);

  const hasResults = filteredSections.length > 0;

  const toggle = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const onContactSupport = useCallback(() => {
    const subject = encodeURIComponent(CONTACT_SUBJECT);
    const mail = `mailto:${CONTACT_EMAIL}?subject=${subject}`;
    void Linking.openURL(mail).catch(() => {
      Alert.alert('Could not open email', `Reach us at ${CONTACT_EMAIL}.`);
    });
  }, []);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
      >
        <View style={[styles.stickyHeaderWrap, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={26} color="#534AB7" />
            </Pressable>
            <Text style={styles.headerTitle}>FAQ</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#888780" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search FAQ"
              placeholderTextColor="#9C9BA8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search FAQ questions"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color="#A8A79F" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {hasResults ? (
          filteredSections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((item, index) => {
                  const key = `${section.title}:${item.q}`;
                  const open = Boolean(openMap[key]);
                  const isLast = index === section.items.length - 1;
                  return (
                    <View key={key}>
                      <Pressable
                        onPress={() => toggle(key)}
                        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                      >
                        <Text style={styles.q}>{item.q}</Text>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#534AB7" />
                      </Pressable>
                      {open ? <Text style={styles.a}>{item.a}</Text> : null}
                      {!isLast ? <View style={styles.divider} /> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {`No results for "${query}" — try a shorter search or contact support.`}
            </Text>
          </View>
        )}

        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>Still have a question?</Text>
          <Pressable
            style={({ pressed }) => [styles.supportBtn, pressed && styles.supportBtnPressed]}
            onPress={onContactSupport}
            accessibilityRole="button"
            accessibilityLabel="Contact support"
          >
            <Text style={styles.supportBtnText}>Contact support</Text>
          </Pressable>
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
  scrollContent: {
    paddingHorizontal: 20,
  },
  stickyHeaderWrap: {
    backgroundColor: '#F2F0EB',
    paddingBottom: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
  },
  headerSpacer: {
    width: 26,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a18',
    paddingVertical: 0,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#72727F',
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F2F0EB',
    marginLeft: 14,
  },
  q: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a18',
    lineHeight: 20,
  },
  a: {
    marginTop: -2,
    marginBottom: 12,
    marginHorizontal: 14,
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
  },
  emptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  supportCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: 14,
    marginTop: 6,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a18',
    marginBottom: 10,
  },
  supportBtn: {
    backgroundColor: '#534AB7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  supportBtnPressed: {
    opacity: 0.9,
  },
  supportBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
