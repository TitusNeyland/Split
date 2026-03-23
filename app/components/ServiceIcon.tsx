import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const UNKNOWN_BG = '#5F5E5A';
const UNKNOWN_FG = '#ffffff';

export type ServiceGlyphKind =
  | 'tv-play'
  | 'music'
  | 'tv-screen'
  | 'play-triangle'
  | 'tv-panel'
  | 'gamepad'
  | 'cloud'
  | 'box-open'
  | 'brush'
  | 'grid';

type BrandRule = {
  match: (n: string) => boolean;
  backgroundColor: string;
  iconColor: string;
  glyph: ServiceGlyphKind;
};

/**
 * First match wins. Put specific phrases (e.g. "apple tv") before broad "amazon".
 */
const BRAND_RULES: BrandRule[] = [
  {
    match: (n) => n.includes('netflix'),
    backgroundColor: '#000000',
    iconColor: '#E50914',
    glyph: 'tv-screen',
  },
  { match: (n) => n.includes('spotify'), backgroundColor: '#1DB954', iconColor: '#000000', glyph: 'music' },
  {
    match: (n) => n.includes('apple tv') || n.includes('appletv'),
    backgroundColor: '#000000',
    iconColor: '#ffffff',
    glyph: 'tv-screen',
  },
  { match: (n) => n.includes('hulu'), backgroundColor: '#1CE783', iconColor: '#000000', glyph: 'tv-panel' },
  { match: (n) => n.includes('disney'), backgroundColor: '#113CCF', iconColor: '#ffffff', glyph: 'tv-panel' },
  {
    match: (n) => n.includes('youtube'),
    backgroundColor: '#FF0000',
    iconColor: '#ffffff',
    glyph: 'tv-screen',
  },
  {
    match: (n) =>
      n.includes('prime video') ||
      n.includes('amazon video') ||
      n.includes('amazon prime') ||
      (n.includes('amazon') && !n.includes('music')),
    backgroundColor: '#00A8E1',
    iconColor: '#ffffff',
    glyph: 'tv-panel',
  },
  {
    match: (n) => n.includes('xbox') || n.includes('game pass'),
    backgroundColor: '#107C10',
    iconColor: '#ffffff',
    glyph: 'gamepad',
  },
  { match: (n) => n.includes('icloud'), backgroundColor: '#3478F6', iconColor: '#ffffff', glyph: 'cloud' },
  { match: (n) => n.includes('google one'), backgroundColor: '#4285F4', iconColor: '#ffffff', glyph: 'cloud' },
  { match: (n) => n.includes('dropbox'), backgroundColor: '#0061FF', iconColor: '#ffffff', glyph: 'box-open' },
  { match: (n) => n.includes('adobe'), backgroundColor: '#FF0000', iconColor: '#ffffff', glyph: 'brush' },
  {
    match: (n) => n.includes('microsoft 365') || n.includes('office 365'),
    backgroundColor: '#D83B01',
    iconColor: '#ffffff',
    glyph: 'grid',
  },
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
  iconColor: string;
  glyph: ServiceGlyphKind | null;
  fallbackLetter: string;
};

export function resolveServiceIcon(raw: string): ResolvedServiceIcon {
  const n = normalize(raw);
  if (!n) {
    return {
      backgroundColor: UNKNOWN_BG,
      iconColor: UNKNOWN_FG,
      glyph: null,
      fallbackLetter: '?',
    };
  }
  for (const rule of BRAND_RULES) {
    if (rule.match(n)) {
      return {
        backgroundColor: rule.backgroundColor,
        iconColor: rule.iconColor,
        glyph: rule.glyph,
        fallbackLetter: firstLetter(raw),
      };
    }
  }
  return {
    backgroundColor: UNKNOWN_BG,
    iconColor: UNKNOWN_FG,
    glyph: null,
    fallbackLetter: firstLetter(raw),
  };
}

/** Use when persisting `iconColor` / wizard params so tiles match `ServiceIcon`. */
export function getServiceIconBackgroundColor(serviceName: string): string {
  return resolveServiceIcon(serviceName).backgroundColor;
}

function ServiceBrandGlyph({
  kind,
  color,
  size,
}: {
  kind: ServiceGlyphKind;
  color: string;
  size: number;
}) {
  const vb = 24;
  switch (kind) {
    case 'tv-play':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Rect x="3.5" y="5" width="17" height="11" rx="1.6" fill="none" stroke={color} strokeWidth="1.75" />
          <Path d="M9.5 9.2 L9.5 14.8 L14.8 12 Z" fill={color} />
          <Path d="M8 19.5 h8 v1.3 H8z" fill={color} />
        </Svg>
      );
    case 'music':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Path
            d="M15.5 5.5v9.2c0 1-0.8 1.8-1.8 1.8s-1.8-0.8-1.8-1.8 0.8-1.8 1.8-1.8c0.3 0 0.6 0.1 0.9 0.2V8.2l-5 1.5v7.5c0 1-0.8 1.8-1.8 1.8s-1.8-0.8-1.8-1.8 0.8-1.8 1.8-1.8c0.3 0 0.6 0.1 0.9 0.2V5.5l6-2z"
            fill={color}
          />
        </Svg>
      );
    case 'tv-screen':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Rect x="4" y="5.5" width="16" height="10" rx="1.3" fill="none" stroke={color} strokeWidth="1.6" />
          <Path d="M10 17.5 h4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );
    case 'play-triangle':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Path d="M9 6.5 L9 17.5 L18 12 Z" fill={color} />
        </Svg>
      );
    case 'tv-panel':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Rect x="3.5" y="5.5" width="17" height="10.5" rx="2" fill="none" stroke={color} strokeWidth="1.6" />
          <Rect x="6.5" y="8" width="11" height="6" rx="0.9" fill={color} opacity={0.35} />
          <Path d="M9 19 h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </Svg>
      );
    case 'gamepad':
      return <Ionicons name="game-controller" size={size} color={color} />;
    case 'cloud':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Path
            d="M17.5 16.2h-9.8c-2.2 0-4-1.7-4-3.9 0-1.8 1.2-3.3 2.9-3.8 0.4-2.4 2.6-4.2 5.1-4.2 2.5 0 4.6 1.7 5.1 4 1.5 0.3 2.7 1.6 2.7 3.2 0 2-1.6 3.7-3.6 3.7h1.6z"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'box-open':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Path d="M12 4.5 L19 8.2 L12 11.9 L5 8.2 Z" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          <Path d="M5 8.2 L12 12.5 L19 8.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <Path
            d="M5.2 8.5 L5.2 14.8 L12 18.5 L18.8 14.8 L18.8 8.5"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <Path d="M12 12.5 V18.5" stroke={color} strokeWidth="1.5" />
        </Svg>
      );
    case 'brush':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Path d="M5.5 17.8 L10.2 10.5 L12.8 12.2 L9.2 18.5 H7.2 Z" fill={color} />
          <Path d="M11.5 9.2 C13 7.5 15.8 7.8 17.2 9.8" stroke={color} strokeWidth="1.35" fill="none" strokeLinecap="round" />
        </Svg>
      );
    case 'grid':
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityElementsHidden>
          <Rect x="4.5" y="4.5" width="6.2" height="6.2" rx="0.9" fill={color} />
          <Rect x="13.3" y="4.5" width="6.2" height="6.2" rx="0.9" fill={color} />
          <Rect x="4.5" y="13.3" width="6.2" height="6.2" rx="0.9" fill={color} />
          <Rect x="13.3" y="13.3" width="6.2" height="6.2" rx="0.9" fill={color} />
        </Svg>
      );
  }
}

export type ServiceIconProps = {
  serviceName: string;
  /** Outer box is `size` × `size`; default 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const BASE_SIZE = 40;
const BASE_FONT = 18;
const GLYPH_RATIO = 0.58;

export function ServiceIcon({ serviceName, size = BASE_SIZE, style }: ServiceIconProps) {
  const { glyph, fallbackLetter, backgroundColor, iconColor } = useMemo(
    () => resolveServiceIcon(serviceName),
    [serviceName],
  );
  const fontSize = (BASE_FONT * size) / BASE_SIZE * (fallbackLetter.length >= 2 ? 0.82 : 1);
  const borderRadius = size * 0.28;
  const glyphSize = Math.round(size * GLYPH_RATIO);

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
      {glyph ? (
        <ServiceBrandGlyph kind={glyph} color={iconColor} size={glyphSize} />
      ) : (
        <Text
          style={[styles.glyph, { fontSize, color: iconColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
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
    fontWeight: '700',
    textAlign: 'center',
  },
});
