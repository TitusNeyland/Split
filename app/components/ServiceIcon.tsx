import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/** Background colors by category (letter marks only — no brand logos). */
export const SERVICE_ICON_CATEGORY_BG = {
  streaming: '#0F766E',
  music: '#6D28D9',
  cloud: '#1D4ED8',
  gaming: '#EA580C',
  productivity: '#D97706',
  unknown: '#78716C',
} as const;

type ServiceCategory = keyof typeof SERVICE_ICON_CATEGORY_BG;

type Rule = {
  match: (n: string) => boolean;
  category: ServiceCategory;
  /** 1–2 letters, uppercase */
  abbrev: string;
};

/**
 * First match wins. Put more specific phrases (e.g. "apple music") before generic ("apple").
 */
const RULES: Rule[] = [
  { match: (n) => n.includes('youtube music') || n.includes('yt music'), category: 'music', abbrev: 'YM' },
  { match: (n) => n.includes('youtube'), category: 'streaming', abbrev: 'Y' },
  { match: (n) => n.includes('apple music'), category: 'music', abbrev: 'AM' },
  { match: (n) => n.includes('apple tv') || n.includes('appletv'), category: 'streaming', abbrev: 'AT' },
  { match: (n) => n.includes('amazon music'), category: 'music', abbrev: 'AM' },
  { match: (n) => n.includes('prime video') || n.includes('amazon video'), category: 'streaming', abbrev: 'AP' },
  { match: (n) => n.includes('amazon prime'), category: 'streaming', abbrev: 'AP' },
  { match: (n) => n.includes('amazon'), category: 'streaming', abbrev: 'A' },
  { match: (n) => n.includes('icloud'), category: 'cloud', abbrev: 'IC' },
  { match: (n) => n.includes('google one'), category: 'cloud', abbrev: 'GO' },
  { match: (n) => n.includes('google drive'), category: 'cloud', abbrev: 'GD' },
  { match: (n) => n.includes('dropbox'), category: 'cloud', abbrev: 'DB' },
  { match: (n) => n.includes('onedrive'), category: 'cloud', abbrev: 'OD' },
  { match: (n) => n.includes('spotify'), category: 'music', abbrev: 'S' },
  { match: (n) => n.includes('tidal'), category: 'music', abbrev: 'T' },
  { match: (n) => n.includes('pandora'), category: 'music', abbrev: 'P' },
  { match: (n) => n.includes('nintendo'), category: 'gaming', abbrev: 'NT' },
  { match: (n) => n.includes('netflix'), category: 'streaming', abbrev: 'N' },
  { match: (n) => n.includes('hulu'), category: 'streaming', abbrev: 'H' },
  { match: (n) => n.includes('disney'), category: 'streaming', abbrev: 'D' },
  { match: (n) => n.includes('hbo'), category: 'streaming', abbrev: 'HB' },
  { match: (n) => n.includes('peacock'), category: 'streaming', abbrev: 'P' },
  { match: (n) => n.includes('paramount'), category: 'streaming', abbrev: 'P' },
  { match: (n) => n.includes('xbox') || n.includes('game pass'), category: 'gaming', abbrev: 'X' },
  { match: (n) => n.includes('playstation') || n.includes('ps plus') || n.includes('psn'), category: 'gaming', abbrev: 'PS' },
  { match: (n) => n.includes('steam'), category: 'gaming', abbrev: 'ST' },
  { match: (n) => n.includes('ea play'), category: 'gaming', abbrev: 'EA' },
  { match: (n) => n.includes('microsoft 365') || n.includes('office 365'), category: 'productivity', abbrev: 'MS' },
  { match: (n) => n.includes('adobe'), category: 'productivity', abbrev: 'A' },
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

export function resolveServiceIcon(raw: string): { letter: string; backgroundColor: string } {
  const n = normalize(raw);
  if (!n) {
    return { letter: '?', backgroundColor: SERVICE_ICON_CATEGORY_BG.unknown };
  }
  for (const rule of RULES) {
    if (rule.match(n)) {
      return {
        letter: rule.abbrev,
        backgroundColor: SERVICE_ICON_CATEGORY_BG[rule.category],
      };
    }
  }
  return {
    letter: firstLetter(raw),
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

export function ServiceIcon({ serviceName, size = BASE_SIZE, style }: ServiceIconProps) {
  const { letter, backgroundColor } = useMemo(() => resolveServiceIcon(serviceName), [serviceName]);
  const fontSize = (BASE_FONT * size) / BASE_SIZE * (letter.length >= 2 ? 0.82 : 1);
  const borderRadius = size * 0.28;

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
      <Text style={[styles.glyph, { fontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
        {letter}
      </Text>
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
