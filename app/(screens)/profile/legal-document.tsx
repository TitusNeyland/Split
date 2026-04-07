import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type DocKey = 'terms' | 'privacy' | 'refund';
type DocSection = { heading: string; paragraphs: string[] };
type DocContent = { title: string; lastUpdated: string; sections: DocSection[] };

const DOCS: Record<DocKey, DocContent> = {
  terms: {
    title: 'Terms of Service',
    lastUpdated: 'April 7, 2026',
    sections: [
      {
        heading: 'Acceptance of terms',
        paragraphs: [
          'By creating an account or using Kilo, you agree to these Terms of Service. If you do not agree, do not use the app.',
        ],
      },
      {
        heading: 'Description of service',
        paragraphs: [
          'Kilo is a subscription cost-splitting and payment coordination tool. Kilo is not a bank, lender, or financial institution.',
        ],
      },
      {
        heading: 'User accounts',
        paragraphs: [
          'You must be at least 18 years old to use Kilo. You are responsible for maintaining account security and for all activity under your account.',
          'You agree to provide accurate and current account information and to keep that information updated.',
        ],
      },
      {
        heading: 'Payments and billing',
        paragraphs: [
          'When auto-charge is enabled, Kilo attempts to charge each member according to the configured split and billing schedule.',
          'Payment processing is handled by Stripe. You are responsible for ensuring your payment method has sufficient funds and remains valid.',
        ],
      },
      {
        heading: 'Prohibited uses',
        paragraphs: [
          'You may not use Kilo for fraudulent activity, abuse, or unlawful conduct.',
          'You may not use Kilo to collect money for goods or services you do not provide or to misrepresent charges.',
        ],
      },
      {
        heading: 'Third-party services',
        paragraphs: [
          'Kilo uses Stripe for payment processing and Firebase for data storage and infrastructure.',
          'Your use of these features may also be subject to third-party terms, including Stripe Terms of Service.',
        ],
      },
      {
        heading: 'Subscription service disclaimer',
        paragraphs: [
          'Kilo is a cost-splitting tool only. Users are solely responsible for compliance with the terms of service of any subscription service they split through Kilo.',
          'Kilo does not endorse or facilitate violation of third-party terms of service.',
        ],
      },
      {
        heading: 'Third-party trademarks',
        paragraphs: [
          'All product names, logos, and brands, including examples such as Netflix and Spotify, are trademarks of their respective owners.',
          'Kilo is not affiliated with, endorsed by, or sponsored by any named service unless explicitly stated.',
        ],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'To the fullest extent permitted by law, Kilo is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service.',
        ],
      },
      {
        heading: 'Termination',
        paragraphs: [
          'Kilo may suspend or terminate accounts that violate these terms or that present security, legal, or abuse risks.',
        ],
      },
      {
        heading: 'Changes to terms',
        paragraphs: [
          'We may update these Terms from time to time. Continued use of Kilo after updates means you accept the revised Terms.',
        ],
      },
      {
        heading: 'Governing law',
        paragraphs: ['These Terms are governed by the laws of the State of [your state], United States.'],
      },
      {
        heading: 'Contact',
        paragraphs: ['For legal questions, contact legal@getkilo.app.'],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: 'April 7, 2026',
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'We collect account details such as name, email, and profile photo; split and subscription data; and activity data needed to operate Kilo.',
          'Payment method details are stored by Stripe and not on Kilo servers as raw card data.',
        ],
      },
      {
        heading: 'How we use your information',
        paragraphs: [
          'We use information to provide the service, send notifications, improve app performance and features, and support fraud prevention and security.',
        ],
      },
      {
        heading: 'Data sharing',
        paragraphs: [
          'We share data with Stripe for payments and Firebase for infrastructure and storage.',
          'We do not sell personal data to third parties. We do not allow advertisers to promote products through Kilo.',
        ],
      },
      {
        heading: 'Profile photos',
        paragraphs: [
          'Profile photos are stored in Firebase Storage and may be visible to other Kilo users in shared split contexts.',
        ],
      },
      {
        heading: 'Phone number hashing',
        paragraphs: [
          'If you grant contacts access, phone numbers are hashed with SHA-256 before leaving your device and are never stored in plain text.',
        ],
      },
      {
        heading: 'Push notifications',
        paragraphs: [
          'You can opt out of push notifications in your device settings and in-app notification preferences where available.',
        ],
      },
      {
        heading: 'Data retention',
        paragraphs: [
          'Account data is retained until account deletion. Activity history may be retained for up to 90 days after deletion for fraud prevention.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can request access to, correction of, or deletion of your data by contacting privacy@getkilo.app or using the in-app delete account flow.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: ['Kilo is not intended for users under 18 years old.'],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: ['We may update this Privacy Policy. We will reflect the latest update date on this screen.'],
      },
      {
        heading: 'Contact',
        paragraphs: ['For privacy requests, contact privacy@getkilo.app.'],
      },
    ],
  },
  refund: {
    title: 'Refund Policy',
    lastUpdated: 'April 7, 2026',
    sections: [
      {
        heading: 'Kilo subscription (Pro / Business plan)',
        paragraphs: [
          'You may cancel your Kilo plan at any time. No refunds are provided for partial billing periods.',
          'If a free trial converts to a paid plan after 7 days, the converted charge is non-refundable.',
        ],
      },
      {
        heading: 'Split payments between users',
        paragraphs: [
          'Kilo does not control or guarantee payment outcomes between split members. Disputes between members must be resolved between those members.',
        ],
      },
      {
        heading: 'Failed payments',
        paragraphs: [
          'If a member card is declined, that member remains responsible for their share. Kilo may retry charges according to the retry schedule.',
        ],
      },
      {
        heading: 'Stripe fees',
        paragraphs: ['Payment processing fees charged by Stripe are non-refundable.'],
      },
      {
        heading: 'Contact',
        paragraphs: ['For Kilo plan charge refund requests, contact support@getkilo.app.'],
      },
    ],
  },
};

function toDocKey(raw: string | string[] | undefined): DocKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'terms' || value === 'privacy' || value === 'refund') return value;
  return 'terms';
}

export default function ProfileLegalDocumentScreen() {
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const docKey = toDocKey(doc);
  const content = useMemo(() => DOCS[docKey], [docKey]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/profile/legal')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color="#534AB7" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {content.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last updated: {content.lastUpdated}</Text>
        {content.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            {section.paragraphs.map((p) => (
              <Text key={p} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
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
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a18',
  },
  headerSpacer: {
    width: 26,
  },
  scrollPad: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#72727F',
    marginBottom: 14,
  },
  section: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#1a1a18',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: '#444',
    marginBottom: 8,
  },
});
