import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import {
  ACQUISITION_OPTIONS,
  type AcquisitionSourceId,
  saveAcquisitionSourceToFirestore,
} from '../../lib/onboarding/onboardingAcquisition';
import { setOnboardingFindUsStepDone } from '../../lib/onboarding/onboardingStorage';
import { isFirebaseConfigured } from '../../lib/firebase';

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  iconGray: '#5F5E5A',
  rowBorder: '#E8E6E1',
  hairline: '#F0EEE9',
  selectedBg: '#EEEDFE',
  friendIconPurple: '#534AB7',
};

function SourceIcon({ id }: { id: AcquisitionSourceId }) {
  const stroke = C.iconGray;
  const sw = 1.5;

  switch (id) {
    case 'friend_family':
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
            stroke={C.friendIconPurple}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <Circle cx={9} cy={7} r={4} stroke={C.friendIconPurple} strokeWidth={sw} />
        </Svg>
      );
    case 'online_ad':
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Rect x={2} y={3} width={20} height={14} rx={2} stroke={stroke} strokeWidth={sw} />
          <Line x1={8} y1={21} x2={16} y2={21} stroke={stroke} strokeWidth={sw} />
          <Line x1={12} y1={17} x2={12} y2={21} stroke={stroke} strokeWidth={sw} />
        </Svg>
      );
    case 'app_store_search':
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={8} stroke={stroke} strokeWidth={sw} />
          <Line x1={21} y1={21} x2={16.65} y2={16.65} stroke={stroke} strokeWidth={sw} />
        </Svg>
      );
    case 'youtube_tiktok':
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z"
            stroke={stroke}
            strokeWidth={sw}
          />
        </Svg>
      );
    case 'podcast':
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke={stroke} strokeWidth={sw} />
          <Path
            d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"
            stroke={stroke}
            strokeWidth={sw}
          />
        </Svg>
      );
    case 'influencer':
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'other':
    default:
      return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
  }
}

function RadioSelected() {
  return (
    <View style={styles.radioOn}>
      <Svg width={9} height={9} viewBox="0 0 24 24" fill="none">
        <Polyline
          points="20 6 9 17 4 12"
          stroke="#fff"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export default function OnboardingFindUsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<AcquisitionSourceId | null>(null);
  const [saving, setSaving] = useState(false);

  const goToComplete = useCallback(async () => {
    await setOnboardingFindUsStepDone();
    router.replace('/onboarding/complete');
  }, [router]);

  const onSkip = useCallback(async () => {
    await goToComplete();
  }, [goToComplete]);

  const onContinue = useCallback(async () => {
    if (selected && isFirebaseConfigured()) {
      setSaving(true);
      try {
        await saveAcquisitionSourceToFirestore(selected);
      } catch {
        Alert.alert('Could not save', 'Check your connection and try again.');
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    await goToComplete();
  }, [selected, goToComplete]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={onSkip} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>How did you find us?</Text>
        <Text style={styles.sub}>This helps us reach more people like you!</Text>

        <View style={styles.card}>
          {ACQUISITION_OPTIONS.map((opt, index) => {
            const isOn = selected === opt.id;
            const isFriend = opt.id === 'friend_family';
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={({ pressed }) => [
                  styles.row,
                  index < ACQUISITION_OPTIONS.length - 1 && styles.rowBorder,
                  isOn && styles.rowSelected,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <View style={[styles.iconBox, isFriend && styles.iconBoxFriend]}>
                  <SourceIcon id={opt.id} />
                </View>
                <Text style={styles.rowLabel}>{opt.label}</Text>
                <View style={styles.radioSlot}>{isOn ? <RadioSelected /> : <View style={styles.radioOff} />}</View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || saving) && styles.primaryBtnPressed,
            saving && styles.primaryBtnDisabled,
          ]}
          onPress={onContinue}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  skip: {
    fontSize: 13,
    color: C.muted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 28 * 1.15,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 15 * 1.5,
    marginBottom: 24,
  },
  card: {
    borderWidth: 1.5,
    borderColor: C.rowBorder,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.bg,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  rowSelected: {
    backgroundColor: C.selectedBg,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxFriend: {
    backgroundColor: '#EEEDFE',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: C.text,
  },
  radioSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#D3D1C7',
  },
  radioOn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: 4,
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
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
});
