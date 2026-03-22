import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  fieldBorder: 'rgba(0,0,0,0.08)',
};

export type PresetService = {
  id: string;
  name: string;
  letter: string;
  iconBg: string;
  letterColor: string;
  /** Lowest common “from” price in cents for suggestions in later steps. */
  priceCents: number;
};

const PRESETS: PresetService[] = [
  { id: 'netflix', name: 'Netflix', letter: 'N', iconBg: '#E1F5EE', letterColor: '#0F6E56', priceCents: 699 },
  { id: 'spotify', name: 'Spotify', letter: 'S', iconBg: '#EEEDFE', letterColor: '#534AB7', priceCents: 999 },
  { id: 'icloud', name: 'iCloud', letter: 'I', iconBg: '#E6F1FB', letterColor: '#1a5f8a', priceCents: 99 },
  { id: 'xbox', name: 'Xbox', letter: 'X', iconBg: '#FAECE7', letterColor: '#993C1D', priceCents: 999 },
  { id: 'hulu', name: 'Hulu', letter: 'H', iconBg: '#FCEBEB', letterColor: '#B42318', priceCents: 799 },
  {
    id: 'youtube',
    name: 'YouTube Premium',
    letter: 'Y',
    iconBg: '#EAF3DE',
    letterColor: '#3d5c1a',
    priceCents: 1399,
  },
  { id: 'disney', name: 'Disney+', letter: 'D', iconBg: '#E8E4FF', letterColor: '#4338CA', priceCents: 799 },
  {
    id: 'amazon',
    name: 'Amazon Prime',
    letter: 'A',
    iconBg: '#FFF4E6',
    letterColor: '#B45309',
    priceCents: 1499,
  },
  {
    id: 'appletv',
    name: 'Apple TV+',
    letter: 'A',
    iconBg: '#F0EEE9',
    letterColor: '#1a1a18',
    priceCents: 999,
  },
];

function formatFromPrice(cents: number): string {
  return `from $${(cents / 100).toFixed(2)}`;
}

export default function AddSubscriptionStep1Screen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');

  const cols = 3;
  const bodyPad = 16;
  const gap = 8;
  const presetCardWidth = (width - bodyPad * 2 - gap * (cols - 1)) / cols;

  const customTrimmed = customName.trim();
  const hasCustom = customTrimmed.length > 0;
  const selectedPreset = useMemo(
    () => (selectedPresetId ? PRESETS.find((p) => p.id === selectedPresetId) ?? null : null),
    [selectedPresetId],
  );

  const canContinue = selectedPreset !== null || hasCustom;

  const continueLabel = useMemo(() => {
    if (selectedPreset) return `Continue with ${selectedPreset.name}`;
    if (hasCustom) return 'Continue';
    return 'Continue';
  }, [selectedPreset, hasCustom]);

  const onSelectPreset = useCallback((id: string) => {
    setSelectedPresetId(id);
    setCustomName('');
  }, []);

  const onCustomChange = useCallback((t: string) => {
    setCustomName(t);
    setSelectedPresetId(null);
  }, []);

  const onContinue = useCallback(() => {
    if (!canContinue) return;
    if (selectedPreset) {
      router.push({
        pathname: '/add-subscription/details',
        params: {
          serviceName: selectedPreset.name,
          iconColor: selectedPreset.iconBg,
          priceSuggestionCents: String(selectedPreset.priceCents),
        },
      });
      return;
    }
    router.push({
      pathname: '/add-subscription/details',
      params: {
        serviceName: customTrimmed,
        iconColor: '#EEEDFE',
      },
    });
  }, [canContinue, selectedPreset, customTrimmed, router]);

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
          accessibilityLabel="Back to subscriptions"
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backContext}>Subscriptions</Text>
        </Pressable>
        <Text style={styles.stepTitle}>Add a subscription</Text>
        <Text style={styles.stepSub}>Choose a service or add your own</Text>
        <View style={styles.progWrap}>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: '25%' }]} />
          </View>
          <Text style={styles.progLabel}>Step 1 of 4</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(insets.bottom, 16) + 72 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLbl}>Popular services</Text>
        <View style={styles.presetGrid}>
          {PRESETS.map((p) => {
            const selected = selectedPresetId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => onSelectPreset(p.id)}
                style={({ pressed }) => [
                  styles.presetBtn,
                  { width: presetCardWidth },
                  selected && styles.presetBtnSelected,
                  pressed && !selected && styles.presetBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.name}, ${formatFromPrice(p.priceCents)}`}
              >
                <View style={[styles.presetIco, { backgroundColor: p.iconBg }]}>
                  <Text style={[styles.presetLetter, { color: p.letterColor }]}>{p.letter}</Text>
                </View>
                <Text style={styles.presetName} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={styles.presetPrice}>{formatFromPrice(p.priceCents)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLbl, styles.sectionLblSpaced]}>Or add custom</Text>
        <TextInput
          value={customName}
          onChangeText={onCustomChange}
          placeholder="e.g. Disney+, Duolingo, Gym…"
          placeholderTextColor={C.muted}
          style={styles.fieldInput}
          accessibilityLabel="Custom subscription name"
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.primaryBtn,
            !canContinue && styles.primaryBtnDisabled,
            pressed && canContinue && styles.primaryBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
        >
          <Text style={styles.primaryBtnTxt}>{continueLabel}</Text>
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
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  backContext: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  stepTitle: {
    fontSize: 21,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  stepSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
  },
  progWrap: {
    marginTop: 14,
  },
  progTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  progLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 5,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sectionLbl: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionLblSpaced: {
    marginTop: 14,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  presetBtn: {
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  presetBtnSelected: {
    borderWidth: 2,
    borderColor: C.purple,
    backgroundColor: C.purpleTint,
  },
  presetBtnPressed: {
    opacity: 0.92,
  },
  presetIco: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLetter: {
    fontSize: 20,
    fontWeight: '700',
  },
  presetName: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    minHeight: 40,
  },
  presetPrice: {
    fontSize: 12,
    color: C.muted,
  },
  fieldInput: {
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.fieldBorder,
    borderRadius: 12,
    fontSize: 17,
    color: C.text,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.38,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
