import type { CatalogService } from './servicesCatalogTypes';

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
    match: (n) => n.includes('walmart'),
    backgroundColor: '#0071CE',
    iconColor: '#ffffff',
    glyph: 'box-open',
  },
  {
    match: (n) => n.includes('playstation') || n.includes('ps plus') || n.includes('ps+'),
    backgroundColor: '#003791',
    iconColor: '#ffffff',
    glyph: 'gamepad',
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

/** First letter / digit for icon tiles (unicode-aware). */
export function serviceLetterMark(raw: string): string {
  return firstLetter(raw);
}

/** Normalize service ids for fuzzy catalog match (hyphens, case, underscores). */
export function normalizeServiceIdForLookup(id: string): string {
  return id.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

/** Resolve catalog row when subscription / activity `serviceId` differs slightly from `services` docs. */
export function findCatalogServiceByServiceId(
  services: CatalogService[],
  serviceId: string | undefined | null
): CatalogService | null {
  if (!serviceId?.trim() || !services.length) return null;
  const raw = serviceId.trim();
  const norm = normalizeServiceIdForLookup(raw);
  const direct = services.find(
    (s) => s.id === raw || s.serviceId === raw || s.id === norm || s.serviceId === norm
  );
  if (direct) return direct;
  return (
    services.find(
      (s) =>
        normalizeServiceIdForLookup(s.id) === norm || normalizeServiceIdForLookup(s.serviceId) === norm
    ) ?? null
  );
}

export function findCatalogServiceByNameLoose(
  services: CatalogService[],
  name: string | undefined | null
): CatalogService | null {
  const t = name?.trim();
  if (!t || !services.length) return null;
  const lower = t.toLowerCase();
  return (
    services.find((s) => s.name.trim().toLowerCase() === lower) ??
    services.find((s) => normalizeServiceIdForLookup(s.name) === normalizeServiceIdForLookup(t)) ??
    null
  );
}

export type ResolvedServiceIcon = {
  backgroundColor: string;
  iconColor: string;
  glyph: ServiceGlyphKind | null;
  fallbackLetter: string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Readable glyph color on top of a solid brand tile (Firestore `brandColor`). */
export function pickGlyphColorForBackground(hexBg: string): string {
  const rgb = hexToRgb(hexBg);
  if (!rgb) return UNKNOWN_FG;
  return relativeLuminance(rgb) > 0.55 ? '#1a1a18' : '#ffffff';
}

/**
 * Maps catalog `iconType` strings (e.g. `tv`) to drawable glyph kinds.
 * Returns null for unknown / `default` so callers fall back to name-based rules.
 */
export function mapIconTypeStringToGlyph(iconType: string | undefined | null): ServiceGlyphKind | null {
  if (!iconType?.trim()) return null;
  const t = iconType.trim().toLowerCase();
  if (t === 'default') return null;
  const map: Record<string, ServiceGlyphKind> = {
    tv: 'tv-screen',
    'tv-screen': 'tv-screen',
    'tv-panel': 'tv-panel',
    'tv-play': 'tv-play',
    music: 'music',
    gamepad: 'gamepad',
    cloud: 'cloud',
    'box-open': 'box-open',
    brush: 'brush',
    grid: 'grid',
    'play-triangle': 'play-triangle',
  };
  return map[t] ?? null;
}

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
export function getServiceIconBackgroundColor(serviceName: string, brandColorOverride?: string | null): string {
  const o = brandColorOverride?.trim();
  if (o && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(o)) return o;
  return resolveServiceIcon(serviceName).backgroundColor;
}

/** Small calendar dots: prefer vivid icon color on near-black brand tiles. */
export function getServiceIconDotColor(raw: string): string {
  const r = resolveServiceIcon(raw);
  if (!r.glyph) return r.backgroundColor;
  const bg = r.backgroundColor.trim().toLowerCase();
  if (bg === '#000000' || bg === '#000') return r.iconColor;
  return r.backgroundColor;
}
