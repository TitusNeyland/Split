import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Background colors by category (no brand logos — category glyph + color only). */
export const SERVICE_ICON_CATEGORY_BG = {
  streaming: '#0F766E',
  music: '#6D28D9',
  cloud: '#1D4ED8',
  gaming: '#EA580C',
  productivity: '#D97706',
  unknown: '#78716C',
} as const;

type ServiceCategory = keyof typeof SERVICE_ICON_CATEGORY_BG;

type IonIconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICON: Record<Exclude<ServiceCategory, 'unknown'>, IonIconName> = {
  streaming: 'tv-outline',
  music: 'musical-notes-outline',
  cloud: 'cloud-outline',
  gaming: 'game-controller-outline',
  productivity: 'document-text-outline',
};

type Rule = {
  match: (n: string) => boolean;
  category: ServiceCategory;
};

/**
 * First match wins. Put more specific phrases (e.g. "apple music") before generic ("apple").
 */
const RULES: Rule[] = [
  { match: (n) => n.includes('youtube music') || n.includes('yt music'), category: 'music' },
  { match: (n) => n.includes('youtube'), category: 'streaming' },
  { match: (n) => n.includes('apple music'), category: 'music' },
  { match: (n) => n.includes('apple tv') || n.includes('appletv'), category: 'streaming' },
  { match: (n) => n.includes('amazon music'), category: 'music' },
  { match: (n) => n.includes('prime video') || n.includes('amazon video'), category: 'streaming' },
  { match: (n) => n.includes('amazon prime'), category: 'streaming' },
  { match: (n) => n.includes('amazon'), category: 'streaming' },
  { match: (n) => n.includes('icloud'), category: 'cloud' },
  { match: (n) => n.includes('google one'), category: 'cloud' },
  { match: (n) => n.includes('google drive'), category: 'cloud' },
  { match: (n) => n.includes('dropbox'), category: 'cloud' },
  { match: (n) => n.includes('onedrive'), category: 'cloud' },
  { match: (n) => n.includes('spotify'), category: 'music' },
  { match: (n) => n.includes('tidal'), category: 'music' },
  { match: (n) => n.includes('pandora'), category: 'music' },
  { match: (n) => n.includes('nintendo'), category: 'gaming' },
  { match: (n) => n.includes('netflix'), category: 'streaming' },
  { match: (n) => n.includes('hulu'), category: 'streaming' },
  { match: (n) => n.includes('disney'), category: 'streaming' },
  { match: (n) => n.includes('hbo'), category: 'streaming' },
  { match: (n) => n.includes('peacock'), category: 'streaming' },
  { match: (n) => n.includes('paramount'), category: 'streaming' },
  { match: (n) => n.includes('xbox') || n.includes('game pass'), category: 'gaming' },
  { match: (n) => n.includes('playstation') || n.includes('ps plus') || n.includes('psn'), category: 'gaming' },
  { match: (n) => n.includes('steam'), category: 'gaming' },
  { match: (n) => n.includes('ea play'), category: 'gaming' },
  { match: (n) => n.includes('microsoft 365') || n.includes('office 365'), category: 'productivity' },
  { match: (n) => n.includes('adobe'), category: 'productivity' },
];

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\+/g, ' plus');
}

function firstLetter(raw: string): string {
  const t = raw.trim();
  if (!t) return '?';
  const m = t.match(/[\p{L}\p{N}]/u);
  return m ? m[0]!.toUpperCase() : '?';
}

export type ResolvedServiceIcon = {
  backgroundColor: string;
  /** Set when the name matched a known category; otherwise show `fallbackLetter`. */
  icon: IonIconName | null;
  fallbackLetter: string;
};

export function resolveServiceIcon(raw: string): ResolvedServiceIcon {
  const n = normalize(raw);
  if (!n) {
    return {
      icon: null,
      fallbackLetter: '?',
      backgroundColor: SERVICE_ICON_CATEGORY_BG.unknown,
    };
  }
  for (const rule of RULES) {
    if (rule.match(n)) {
      const cat = rule.category;
      const icon = cat === 'unknown' ? null : CATEGORY_ICON[cat];
      return {
        icon,
        fallbackLetter: firstLetter(raw),
        backgroundColor: SERVICE_ICON_CATEGORY_BG[cat],
      };
    }
  }
  return {
    icon: null,
    fallbackLetter: firstLetter(raw),
    backgroundColor: SERVICE_ICON_CATEGORY_BG.unknown,
  };
}

/** Use when persisting `iconColor` / wizard params so tiles match `ServiceIcon`. */
export function getServiceIconBackgroundColor(serviceName: string): string {
  return resolveServiceIcon(serviceName).backgroundColor;
}

export type ServiceIconProps = {
  serviceName: string;
  /** Outer box is `size` × `size`; default 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const BASE_SIZE = 40;
const BASE_FONT = 18;
const ICON_RATIO = 0.52;

export function ServiceIcon({ serviceName, size = BASE_SIZE, style }: ServiceIconProps) {
  const { icon, fallbackLetter, backgroundColor } = useMemo(
    () => resolveServiceIcon(serviceName),
    [serviceName],
  );
  const fontSize = (BASE_FONT * size) / BASE_SIZE * (fallbackLetter.length >= 2 ? 0.82 : 1);
  const borderRadius = size * 0.28;
  const iconPixel = Math.round(size * ICON_RATIO);

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${serviceName.trim() || 'Subscription'} icon`}
    >
      {icon ? (
        <Ionicons name={icon} size={iconPixel} color="#fff" />
      ) : (
        <Text style={[styles.glyph, { fontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
          {fallbackLetter}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glyph: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
});
