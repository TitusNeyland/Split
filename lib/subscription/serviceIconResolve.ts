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

/** Small calendar dots: prefer vivid icon color on near-black brand tiles. */
export function getServiceIconDotColor(raw: string): string {
  const r = resolveServiceIcon(raw);
  if (!r.glyph) return r.backgroundColor;
  const bg = r.backgroundColor.trim().toLowerCase();
  if (bg === '#000000' || bg === '#000') return r.iconColor;
  return r.backgroundColor;
}
