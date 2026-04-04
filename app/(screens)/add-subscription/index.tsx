import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  BackHandler,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useServices } from '../../../contexts/ServicesContext';
import { formatUsdFromCents } from '../../../lib/format/currency';
import { getServiceIconBackgroundColor, ServiceIcon } from '../../../components/shared/ServiceIcon';

const FILTER_PILL_SCROLL_PADDING = 16;

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
  /** Lowest common “from” price in cents for suggestions in later steps. */
  priceCents: number;
  brandColor?: string;
};

/** Category → example service names (for exports / docs; picker uses Firestore catalog). */
export const SERVICE_CATEGORIES: Record<string, readonly string[]> = {
  streaming: ['Netflix', 'Disney+', 'YouTube Premium', 'Hulu', 'Paramount+'],
  music: ['Spotify', 'Apple Music', 'Audible'],
  gaming: ['Xbox Game Pass', 'PlayStation Plus', 'Nintendo Online'],
  ai: ['ChatGPT Plus', 'Claude Pro', 'Gemini Advanced'],
  cloud: ['iCloud', 'Google One', 'Dropbox'],
  shopping: ['Amazon Prime', 'Instacart+', 'Uber One'],
  apps: ['Adobe CC', 'Microsoft 365', 'MasterClass'],
  fitness: ['Peloton', 'Strava', 'Headspace'],
  lifestyle: ['IPSY', 'HelloFresh', 'BarkBox'],
};

type CategoryFilterId = 'all' | keyof typeof SERVICE_CATEGORIES;

const CATEGORY_FILTERS: { id: CategoryFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'music', label: 'Music' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'ai', label: 'AI' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'apps', label: 'Apps' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'lifestyle', label: 'Lifestyle' },
];

function formatFromPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `from ${formatUsdFromCents(cents)}`;
}

export default function AddSubscriptionStep1Screen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { services } = useServices();
  const leaveAddSubscriptionFlow = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/subscriptions');
    }
  }, [router]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<CategoryFilterId>('all');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const filterScrollRef = useRef<ScrollView>(null);
  const pillLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const filterScrollWidth = useRef(0);
  const filterScrollX = useRef(0);
  const customInputRef = useRef<TextInput>(null);

  const cols = 3;
  const bodyPad = 16;
  const gap = 8;
  const presetCardWidth = (width - bodyPad * 2 - gap * (cols - 1)) / cols;

  const filteredPresets = useMemo((): PresetService[] => {
    if (selectedCategoryId === 'all') {
      return services.map((s) => ({
        id: s.id,
        name: s.name,
        priceCents: s.priceCentsMin,
        brandColor: s.brandColor,
      }));
    }
    return services
      .filter((s) => s.category === selectedCategoryId)
      .map((s) => ({
        id: s.id,
        name: s.name,
        priceCents: s.priceCentsMin,
        brandColor: s.brandColor,
      }));
  }, [services, selectedCategoryId]);

  const customTrimmed = customName.trim();
  const hasCustom = customTrimmed.length > 0;
  const selectedPreset = useMemo(
    () => (selectedPresetId ? services.find((p) => p.id === selectedPresetId) ?? null : null),
    [selectedPresetId, services],
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
          serviceId: selectedPreset.id,
          iconColor: getServiceIconBackgroundColor(selectedPreset.name, selectedPreset.brandColor),
          priceSuggestionCents: String(selectedPreset.priceCentsMin),
        },
      });
      return;
    }
    router.push({
      pathname: '/add-subscription/details',
      params: {
        serviceName: customTrimmed,
        iconColor: getServiceIconBackgroundColor(customTrimmed),
      },
    });
  }, [canContinue, selectedPreset, customTrimmed, router]);

  const onPillLayout = useCallback((id: string) => (e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    pillLayouts.current[id] = { x, width: w };
  }, []);

  const onFilterScrollLayout = useCallback((e: LayoutChangeEvent) => {
    filterScrollWidth.current = e.nativeEvent.layout.width;
  }, []);

  const scrollSelectedPillIntoView = useCallback(() => {
    const layout = pillLayouts.current[selectedCategoryId];
    const viewW = filterScrollWidth.current;
    if (!layout || !viewW || !filterScrollRef.current) return;
    const pad = FILTER_PILL_SCROLL_PADDING;
    const scrollX = filterScrollX.current;
    const pillLeft = layout.x;
    const pillRight = layout.x + layout.width;
    let nextX = scrollX;
    if (pillLeft < scrollX + pad) {
      nextX = pillLeft - pad;
    } else if (pillRight > scrollX + viewW - pad) {
      nextX = pillRight - viewW + pad;
    } else {
      return;
    }
    filterScrollRef.current.scrollTo({ x: Math.max(0, nextX), animated: true });
  }, [selectedCategoryId]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollSelectedPillIntoView());
    });
    return () => cancelAnimationFrame(id);
  }, [selectedCategoryId, scrollSelectedPillIntoView]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveAddSubscriptionFlow();
      return true;
    });
    return () => sub.remove();
  }, [leaveAddSubscriptionFlow]);

  const onFilterScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    filterScrollX.current = e.nativeEvent.contentOffset.x;
  }, []);

  const setCategory = useCallback(
    (id: CategoryFilterId) => {
      setSelectedCategoryId(id);
      const nextPresets =
        id === 'all' ? services : services.filter((s) => s.category === id);
      const ids = new Set(nextPresets.map((p) => p.id));
      setSelectedPresetId((cur) => (cur && ids.has(cur) ? cur : null));
    },
    [services],
  );

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
          onPress={leaveAddSubscriptionFlow}
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
        <Text style={styles.sectionLbl}>Browse Services</Text>
        <ScrollView
          ref={filterScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterScrollContent}
          onLayout={onFilterScrollLayout}
          onScroll={onFilterScroll}
          scrollEventThrottle={32}
        >
          {CATEGORY_FILTERS.map((c) => {
            const selected = selectedCategoryId === c.id;
            return (
              <Pressable
                key={c.id}
                onLayout={onPillLayout(c.id)}
                onPress={() => setCategory(c.id)}
                style={[styles.filterPill, selected && styles.filterPillSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Filter by ${c.label}`}
              >
                <Text style={[styles.filterPillTxt, selected && styles.filterPillTxtSelected]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.presetGrid}>
          {filteredPresets.map((p) => {
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
                <ServiceIcon serviceName={p.name} serviceId={p.id} size={42} />
                <Text style={styles.presetName} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={styles.presetPrice}>{formatFromPrice(p.priceCents)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLbl, styles.sectionLblSpaced]}>Add custom</Text>
        <TextInput
          ref={customInputRef}
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
  filterScroll: {
    marginTop: 10,
    marginBottom: 12,
    marginHorizontal: -16,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  filterPill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillSelected: {
    backgroundColor: C.purple,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  filterPillTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  filterPillTxtSelected: {
    color: '#fff',
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
