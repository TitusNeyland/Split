import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

const C = {
  bg: '#FFFFFF',
  purple: '#534AB7',
  gradientStart: '#7F77DD',
  text: '#1a1a18',
  muted: '#888780',
};

const AVATAR_PIPS = [
  { label: 'JD', bg: '#EEEDFE', color: '#534AB7' },
  { label: 'AL', bg: '#E1F5EE', color: '#0F6E56' },
  { label: 'SM', bg: '#FAECE7', color: '#993C1D' },
  { label: 'TR', bg: '#E6F1FB', color: '#185FA5' },
  { label: '+2k', bg: '#F0EEE9', color: '#888780' },
] as const;

const PIP_SIZE = 28;
const PIP_OVERLAP = 7;
const PIP_BORDER = 2;

function LogoLayersIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L2 7l10 5 10-5-10-5z"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M2 17l10 5 10-5"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M2 12l10 5 10-5"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function OnboardingWelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.centerBlock}>
        <LinearGradient
          colors={[C.gradientStart, C.purple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logo}
        >
          <LogoLayersIcon />
        </LinearGradient>

        <Text style={styles.title}>Stop chasing people for money</Text>
        <Text style={styles.subtitle}>
          Split subscriptions, scan receipts, and collect automatically.
        </Text>

        <View style={styles.socialProof}>
          <View style={styles.pipsRow}>
            {AVATAR_PIPS.map((pip, i) => (
              <View
                key={pip.label}
                style={[
                  styles.pip,
                  {
                    backgroundColor: pip.bg,
                    marginLeft: i === 0 ? 0 : -PIP_OVERLAP,
                    zIndex: i + 1,
                  },
                ]}
              >
                <Text style={[styles.pipText, { color: pip.color }]}>{pip.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.proofCaption}>Joined by 2,000+ people splitting smarter</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: 32 + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={() => router.replace('/onboarding/goals')}
        >
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.ghostWrap, pressed && styles.ghostPressed]}
          onPress={() => router.replace('/sign-in')}
        >
          <Text style={styles.ghostText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.6,
    lineHeight: 30 * 1.15,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 14 * 1.6,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 320,
  },
  socialProof: {
    alignItems: 'center',
    gap: 6,
  },
  pipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pip: {
    width: PIP_SIZE,
    height: PIP_SIZE,
    borderRadius: PIP_SIZE / 2,
    borderWidth: PIP_BORDER,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipText: {
    fontSize: 9,
    fontWeight: '600',
  },
  proofCaption: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    gap: 0,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
  ghostWrap: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ghostPressed: {
    opacity: 0.7,
  },
  ghostText: {
    fontSize: 14,
    color: C.text,
    textDecorationLine: 'underline',
    textDecorationColor: C.text,
  },
});
