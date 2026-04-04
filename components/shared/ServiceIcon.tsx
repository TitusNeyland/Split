import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  resolveServiceIcon,
  type ResolvedServiceIcon,
  type ServiceGlyphKind,
  getServiceIconBackgroundColor,
  mapIconTypeStringToGlyph,
  pickGlyphColorForBackground,
  findCatalogServiceByServiceId,
  findCatalogServiceByNameLoose,
  serviceLetterMark,
} from '../../lib/subscription/serviceIconResolve';
import { useServicesOptional } from '../../contexts/ServicesContext';

export type { ServiceGlyphKind, ResolvedServiceIcon };
export { resolveServiceIcon, getServiceIconBackgroundColor };

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
      return <Ionicons name="headset-outline" size={size} color={color} />;
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
    case 'brain':
      return <FontAwesome5 name="brain" size={size} color={color} solid />;
    case 'cart':
      return <Ionicons name="cart-outline" size={size} color={color} />;
    case 'dumbbell':
      return <Ionicons name="barbell-outline" size={size} color={color} />;
    case 'tree':
      return <MaterialCommunityIcons name="tree-outline" size={size} color={color} />;
    case 'phone':
      return <Ionicons name="phone-portrait-outline" size={size} color={color} />;
    default:
      return <Ionicons name="apps-outline" size={size} color={color} />;
  }
}

export type ServiceIconProps = {
  serviceName: string;
  /** When set, prefers Firestore catalog (brand color + icon type) over name-only rules. */
  serviceId?: string;
  /** Outer box is `size` × `size`; default 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Subscription detail “ended” hero: neutral tile + muted glyph. */
  endedDimmed?: boolean;
  /** Subscriptions list ended card: gray tile (#F0EEE9) + gray glyph (#888780). */
  listEndedMuted?: boolean;
};

const BASE_SIZE = 40;
const BASE_FONT = 18;
const GLYPH_RATIO = 0.58;

const ENDED_BG = 'rgba(255,255,255,0.08)';
const ENDED_GLYPH = 'rgba(255,255,255,0.3)';
const LIST_ENDED_BG = '#F0EEE9';
const LIST_ENDED_GLYPH = '#888780';

export function ServiceIcon({
  serviceName,
  serviceId,
  size = BASE_SIZE,
  style,
  endedDimmed,
  listEndedMuted,
}: ServiceIconProps) {
  const catalogCtx = useServicesOptional();
  const { glyph, fallbackLetter, backgroundColor, iconColor } = useMemo(() => {
    const trimmedName = serviceName.trim();
    const sid = serviceId?.trim();
    const labelForResolve = trimmedName || sid || '?';
    const fallback = resolveServiceIcon(labelForResolve);
    const list = catalogCtx?.services;
    if (!list?.length) {
      return {
        glyph: fallback.glyph,
        fallbackLetter: serviceLetterMark(labelForResolve),
        backgroundColor: fallback.backgroundColor,
        iconColor: fallback.iconColor,
      };
    }
    let catalog = sid ? findCatalogServiceByServiceId(list, sid) : null;
    if (!catalog && trimmedName) {
      catalog = findCatalogServiceByNameLoose(list, trimmedName);
    }
    if (!catalog) {
      return {
        glyph: fallback.glyph,
        fallbackLetter: serviceLetterMark(labelForResolve),
        backgroundColor: fallback.backgroundColor,
        iconColor: fallback.iconColor,
      };
    }
    const fromType = mapIconTypeStringToGlyph(catalog.iconType);
    const nameFallback = resolveServiceIcon(catalog.name || trimmedName || sid || '?');
    const glyphKind = fromType ?? nameFallback.glyph;
    const bg = catalog.brandColor?.trim() || nameFallback.backgroundColor;
    const letterSource = catalog.name || trimmedName || sid || '?';
    return {
      glyph: glyphKind,
      fallbackLetter: serviceLetterMark(letterSource),
      backgroundColor: bg,
      iconColor: pickGlyphColorForBackground(bg),
    };
  }, [catalogCtx?.services, serviceName, serviceId]);
  const fontSize = (BASE_FONT * size) / BASE_SIZE * (fallbackLetter.length >= 2 ? 0.82 : 1);
  const borderRadius = size * 0.28;
  const glyphSize = Math.round(size * GLYPH_RATIO);
  const tileBg = listEndedMuted ? LIST_ENDED_BG : endedDimmed ? ENDED_BG : backgroundColor;
  const glyphColor = listEndedMuted ? LIST_ENDED_GLYPH : endedDimmed ? ENDED_GLYPH : iconColor;

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: tileBg,
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${serviceName.trim() || serviceId?.trim() || 'Subscription'} icon`}
    >
      {glyph ? (
        <ServiceBrandGlyph kind={glyph} color={glyphColor} size={glyphSize} />
      ) : (
        <Text
          style={[styles.glyph, { fontSize, color: glyphColor }]}
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
