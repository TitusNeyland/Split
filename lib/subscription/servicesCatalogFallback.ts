/**
 * Bundled fallback when Firestore is unavailable (first launch / offline).
 * Keep in sync with Firestore seed; run `npm run seed:services` after editing.
 */
import type { CatalogService, FirestoreServiceTierRow, ServiceCategoryId } from './servicesCatalogTypes';

function m(
  tierId: string,
  name: string,
  priceCents: number,
  billingCycle: 'monthly' | 'yearly',
  sortOrder: number,
  priceChangeNote?: string | null
): FirestoreServiceTierRow {
  return {
    tierId,
    name,
    priceCents,
    billingCycle,
    isActive: true,
    sortOrder,
    priceChangeNote: priceChangeNote ?? null,
  };
}

function minCents(tiers: FirestoreServiceTierRow[]): number {
  const active = tiers.filter((t) => t.isActive !== false);
  const positives = active.map((t) => t.priceCents).filter((c) => typeof c === 'number' && c > 0);
  if (positives.length) return Math.round(Math.min(...positives));
  return active.some((t) => t.priceCents === 0) ? 0 : 0;
}

type Svc = {
  id: string;
  name: string;
  category: ServiceCategoryId;
  brandColor: string;
  iconType: string;
  sortOrder: number;
};

const SVC: Svc[] = [
  { id: 'netflix', name: 'Netflix', category: 'streaming', brandColor: '#E50914', iconType: 'tv-screen', sortOrder: 10 },
  { id: 'hulu', name: 'Hulu', category: 'streaming', brandColor: '#1CE783', iconType: 'tv-panel', sortOrder: 20 },
  { id: 'disney', name: 'Disney+', category: 'streaming', brandColor: '#113CCF', iconType: 'tv-panel', sortOrder: 30 },
  { id: 'hbo', name: 'HBO Max', category: 'streaming', brandColor: '#582AF5', iconType: 'tv-screen', sortOrder: 40 },
  {
    id: 'amazon-prime-video',
    name: 'Amazon Prime Video',
    category: 'streaming',
    brandColor: '#00A8E1',
    iconType: 'tv-panel',
    sortOrder: 50,
  },
  { id: 'appletv', name: 'Apple TV+', category: 'streaming', brandColor: '#FAFAFA', iconType: 'tv-screen', sortOrder: 60 },
  { id: 'spotify', name: 'Spotify', category: 'music', brandColor: '#1DB954', iconType: 'music', sortOrder: 70 },
  { id: 'apple-music', name: 'Apple Music', category: 'music', brandColor: '#FA243C', iconType: 'music', sortOrder: 80 },
  { id: 'tidal', name: 'Tidal', category: 'music', brandColor: '#000000', iconType: 'music', sortOrder: 90 },
  { id: 'youtube-music', name: 'YouTube Music', category: 'music', brandColor: '#FF0000', iconType: 'music', sortOrder: 100 },
  { id: 'xbox-gp', name: 'Xbox Game Pass', category: 'gaming', brandColor: '#107C10', iconType: 'gamepad', sortOrder: 110 },
  { id: 'ps-plus', name: 'PlayStation Plus', category: 'gaming', brandColor: '#0070D1', iconType: 'gamepad', sortOrder: 120 },
  { id: 'nintendo', name: 'Nintendo Online', category: 'gaming', brandColor: '#E60012', iconType: 'gamepad', sortOrder: 130 },
  { id: 'chatgpt', name: 'ChatGPT Plus', category: 'ai', brandColor: '#10A37F', iconType: 'grid', sortOrder: 140 },
  { id: 'claude', name: 'Claude Pro', category: 'ai', brandColor: '#CC785C', iconType: 'grid', sortOrder: 150 },
  { id: 'copilot', name: 'Copilot Pro', category: 'ai', brandColor: '#0078D4', iconType: 'grid', sortOrder: 160 },
  { id: 'gemini', name: 'Gemini Advanced', category: 'ai', brandColor: '#4285F4', iconType: 'grid', sortOrder: 170 },
  { id: 'midjourney', name: 'Midjourney', category: 'ai', brandColor: '#000000', iconType: 'brush', sortOrder: 180 },
  { id: 'icloud', name: 'iCloud', category: 'cloud', brandColor: '#3478F6', iconType: 'cloud', sortOrder: 190 },
  { id: 'google-one', name: 'Google One', category: 'cloud', brandColor: '#4285F4', iconType: 'cloud', sortOrder: 200 },
  { id: 'dropbox', name: 'Dropbox', category: 'cloud', brandColor: '#0061FF', iconType: 'box-open', sortOrder: 210 },
  { id: 'onedrive', name: 'OneDrive', category: 'cloud', brandColor: '#0078D4', iconType: 'cloud', sortOrder: 220 },
  { id: 'amazon-prime', name: 'Amazon Prime', category: 'shopping', brandColor: '#FF9900', iconType: 'box-open', sortOrder: 230 },
  { id: 'instacart', name: 'Instacart+', category: 'shopping', brandColor: '#43B02A', iconType: 'box-open', sortOrder: 240 },
  { id: 'doordash', name: 'DoorDash DashPass', category: 'shopping', brandColor: '#FF3008', iconType: 'box-open', sortOrder: 250 },
  { id: 'adobe', name: 'Adobe CC', category: 'apps', brandColor: '#FF0000', iconType: 'brush', sortOrder: 260 },
  { id: 'm365', name: 'Microsoft 365', category: 'apps', brandColor: '#D83B01', iconType: 'grid', sortOrder: 270 },
  { id: 'duolingo', name: 'Duolingo Plus', category: 'apps', brandColor: '#58CC02', iconType: 'grid', sortOrder: 280 },
  { id: 'peloton', name: 'Peloton', category: 'fitness', brandColor: '#000000', iconType: 'play-triangle', sortOrder: 290 },
  { id: 'strava', name: 'Strava', category: 'fitness', brandColor: '#FC5200', iconType: 'play-triangle', sortOrder: 300 },
  { id: 'mfp', name: 'MyFitnessPal', category: 'fitness', brandColor: '#0066EE', iconType: 'grid', sortOrder: 310 },
];

const TIERS: Record<string, FirestoreServiceTierRow[]> = {
  netflix: [
    m('netflix_ads', 'Standard with ads', 699, 'monthly', 0),
    m('netflix_std', 'Standard', 1549, 'monthly', 1),
    m('netflix_prem', 'Premium', 2299, 'monthly', 2, 'Price updated recently'),
  ],
  hulu: [
    m('hulu_ads', 'With ads', 799, 'monthly', 0),
    m('hulu_noads', 'No ads', 1799, 'monthly', 1),
    m('hulu_live_ads', 'Live TV + ads', 8299, 'monthly', 2),
    m('hulu_live', 'Live TV no ads', 9599, 'monthly', 3),
  ],
  disney: [
    m('disney_basic', 'Basic with ads', 799, 'monthly', 0),
    m('disney_prem', 'Premium', 1399, 'monthly', 1),
  ],
  hbo: [
    m('hbo_ads', 'With ads', 999, 'monthly', 0),
    m('hbo_free', 'Ad-free', 1599, 'monthly', 1),
  ],
  'amazon-prime-video': [
    m('apv_month', 'Prime (monthly)', 1499, 'monthly', 0),
    m('apv_year', 'Prime (annual)', 13900, 'yearly', 1),
  ],
  appletv: [m('atv_std', 'Apple TV+', 999, 'monthly', 0)],
  spotify: [
    m('sp_ind', 'Individual', 1199, 'monthly', 0),
    m('sp_duo', 'Duo', 1699, 'monthly', 1),
    m('sp_fam', 'Family', 1999, 'monthly', 2),
    m('sp_stu', 'Student', 599, 'monthly', 3),
  ],
  'apple-music': [
    m('am_ind', 'Individual', 1099, 'monthly', 0),
    m('am_fam', 'Family', 1699, 'monthly', 1),
    m('am_stu', 'Student', 599, 'monthly', 2),
  ],
  tidal: [
    m('td_ind', 'Individual', 1099, 'monthly', 0),
    m('td_fam', 'Family', 1699, 'monthly', 1),
    m('td_hifi', 'HiFi Plus', 1999, 'monthly', 2),
  ],
  'youtube-music': [
    m('ytm_ind', 'Individual', 1099, 'monthly', 0),
    m('ytm_fam', 'Family', 1699, 'monthly', 1),
    m('ytm_stu', 'Student', 599, 'monthly', 2),
  ],
  'xbox-gp': [
    m('xgp_core', 'Core', 999, 'monthly', 0),
    m('xgp_std', 'Standard', 1499, 'monthly', 1),
    m('xgp_ult', 'Ultimate', 1999, 'monthly', 2),
  ],
  'ps-plus': [
    m('ps_ess', 'Essential', 799, 'monthly', 0),
    m('ps_extra', 'Extra', 1499, 'monthly', 1),
    m('ps_prem', 'Premium', 1799, 'monthly', 2),
  ],
  nintendo: [
    m('nin_ind', 'Individual', 399, 'monthly', 0),
    m('nin_fam', 'Family', 799, 'monthly', 1),
    m('nin_exp_ind', 'Individual + Expansion', 4999, 'yearly', 2),
    m('nin_exp_fam', 'Family + Expansion', 7999, 'yearly', 3),
  ],
  chatgpt: [
    m('cg_plus', 'Plus', 2000, 'monthly', 0),
    m('cg_pro', 'Pro', 20000, 'monthly', 1),
  ],
  claude: [m('claude_pro', 'Pro', 2000, 'monthly', 0)],
  copilot: [m('copilot_pro', 'Pro', 2000, 'monthly', 0)],
  gemini: [m('gem_adv', 'Advanced', 1999, 'monthly', 0)],
  midjourney: [
    m('mj_basic', 'Basic', 1000, 'monthly', 0),
    m('mj_std', 'Standard', 3000, 'monthly', 1),
    m('mj_pro', 'Pro', 6000, 'monthly', 2),
  ],
  icloud: [
    m('icloud_50', '50GB', 99, 'monthly', 0),
    m('icloud_200', '200GB', 299, 'monthly', 1),
    m('icloud_2tb', '2TB', 999, 'monthly', 2),
    m('icloud_6tb', '6TB', 2999, 'monthly', 3),
    m('icloud_12tb', '12TB', 5999, 'monthly', 4),
  ],
  'google-one': [
    m('go_100', '100GB', 199, 'monthly', 0),
    m('go_200', '200GB', 299, 'monthly', 1),
    m('go_2tb', '2TB', 999, 'monthly', 2),
  ],
  dropbox: [
    m('db_plus', 'Plus', 1199, 'monthly', 0),
    m('db_ess', 'Essentials', 2200, 'monthly', 1),
    m('db_bus', 'Business', 1500, 'monthly', 2),
  ],
  onedrive: [
    m('od_100', '100GB', 199, 'monthly', 0),
    m('od_m365p', 'Microsoft 365 Personal', 699, 'monthly', 1),
    m('od_m365f', 'Family', 999, 'monthly', 2),
  ],
  'amazon-prime': [
    m('amzpm', 'Monthly', 1499, 'monthly', 0),
    m('amzpy', 'Annual', 13900, 'yearly', 1),
  ],
  instacart: [m('ic_plus', 'Instacart+', 999, 'monthly', 0)],
  doordash: [m('dd_dash', 'DashPass', 999, 'monthly', 0)],
  adobe: [
    m('ad_ph', 'Photography', 999, 'monthly', 0),
    m('ad_all', 'All Apps', 5499, 'monthly', 1),
    m('ad_stu', 'Student', 1999, 'monthly', 2),
  ],
  m365: [
    m('m365_p', 'Personal', 699, 'monthly', 0),
    m('m365_f', 'Family', 999, 'monthly', 1),
  ],
  duolingo: [
    m('duo_sup', 'Super', 699, 'monthly', 0),
    m('duo_max', 'Max', 1399, 'monthly', 1),
  ],
  peloton: [
    m('pel_free', 'App One', 0, 'monthly', 0),
    m('pel_plus', 'App+', 1299, 'monthly', 1),
    m('pel_all', 'All-Access', 4400, 'monthly', 2),
  ],
  strava: [m('strava_sub', 'Individual', 799, 'monthly', 0)],
  mfp: [m('mfp_prem', 'Premium', 999, 'monthly', 0)],
};

export const FALLBACK_TIERS_BY_SERVICE_ID: Record<string, FirestoreServiceTierRow[]> = TIERS;

export const FALLBACK_SERVICES: CatalogService[] = SVC.map((s) => {
  const tiers = TIERS[s.id] ?? [];
  return {
    id: s.id,
    serviceId: s.id,
    name: s.name,
    category: s.category,
    brandColor: s.brandColor,
    iconType: s.iconType,
    isActive: true,
    sortOrder: s.sortOrder,
    priceCentsMin: minCents(tiers),
  };
});
