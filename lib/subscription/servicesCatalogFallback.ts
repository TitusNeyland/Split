/**
 * Bundled fallback when Firestore is unavailable (first launch / offline).
 * Keep in sync with Firestore seed; run `npm run seed:services` or `node scripts/seedServices.js` after editing.
 */
import type { CatalogService, FirestoreServiceTierRow, ServiceCategoryId } from './servicesCatalogTypes';

function tierRow(
  serviceId: string,
  idx: number,
  name: string,
  priceCents: number,
  billingCycle: 'monthly' | 'yearly',
  priceChangeNote?: string | null
): FirestoreServiceTierRow {
  return {
    tierId: `${serviceId}_${idx}`,
    name,
    priceCents,
    billingCycle,
    isActive: true,
    sortOrder: idx,
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
  { id: 'netflix', name: 'Netflix', category: 'streaming', brandColor: '#E50914', iconType: 'tv-screen', sortOrder: 1001 },
  {
    id: 'amazon-prime-video',
    name: 'Amazon Prime Video',
    category: 'streaming',
    brandColor: '#00A8E1',
    iconType: 'tv-panel',
    sortOrder: 1002,
  },
  { id: 'disney', name: 'Disney+', category: 'streaming', brandColor: '#113CCF', iconType: 'tv-panel', sortOrder: 1003 },
  { id: 'hbo', name: 'HBO Max', category: 'streaming', brandColor: '#5822B2', iconType: 'tv-screen', sortOrder: 1004 },
  {
    id: 'youtube-premium',
    name: 'YouTube Premium',
    category: 'streaming',
    brandColor: '#FF0000',
    iconType: 'tv-screen',
    sortOrder: 1005,
  },
  { id: 'hulu', name: 'Hulu', category: 'streaming', brandColor: '#1CE783', iconType: 'tv-panel', sortOrder: 1006 },
  { id: 'paramount', name: 'Paramount+', category: 'streaming', brandColor: '#0064FF', iconType: 'tv-panel', sortOrder: 1007 },
  { id: 'appletv', name: 'Apple TV+', category: 'streaming', brandColor: '#000000', iconType: 'tv-screen', sortOrder: 1008 },
  { id: 'peacock', name: 'Peacock', category: 'streaming', brandColor: '#000000', iconType: 'tv-panel', sortOrder: 1009 },
  { id: 'crunchyroll', name: 'Crunchyroll', category: 'streaming', brandColor: '#F47521', iconType: 'tv-panel', sortOrder: 1010 },
  { id: 'spotify', name: 'Spotify', category: 'music', brandColor: '#1DB954', iconType: 'music', sortOrder: 2001 },
  { id: 'apple-music', name: 'Apple Music', category: 'music', brandColor: '#FC3C44', iconType: 'music', sortOrder: 2002 },
  { id: 'tidal', name: 'Tidal', category: 'music', brandColor: '#000000', iconType: 'music', sortOrder: 2003 },
  { id: 'youtube-music', name: 'YouTube Music', category: 'music', brandColor: '#FF0000', iconType: 'music', sortOrder: 2004 },
  { id: 'audible', name: 'Audible', category: 'music', brandColor: '#FF9900', iconType: 'music', sortOrder: 2005 },
  { id: 'xbox-gp', name: 'Xbox Game Pass', category: 'gaming', brandColor: '#107C10', iconType: 'gamepad', sortOrder: 3001 },
  { id: 'ps-plus', name: 'PlayStation Plus', category: 'gaming', brandColor: '#003791', iconType: 'gamepad', sortOrder: 3002 },
  { id: 'nintendo', name: 'Nintendo Online', category: 'gaming', brandColor: '#E4000F', iconType: 'gamepad', sortOrder: 3003 },
  { id: 'chatgpt', name: 'ChatGPT Plus', category: 'ai', brandColor: '#10A37F', iconType: 'brain', sortOrder: 4001 },
  { id: 'claude', name: 'Claude Pro', category: 'ai', brandColor: '#CC785C', iconType: 'brain', sortOrder: 4002 },
  { id: 'copilot', name: 'Copilot Pro', category: 'ai', brandColor: '#0078D4', iconType: 'brain', sortOrder: 4003 },
  { id: 'gemini', name: 'Gemini Advanced', category: 'ai', brandColor: '#4285F4', iconType: 'brain', sortOrder: 4004 },
  { id: 'midjourney', name: 'Midjourney', category: 'ai', brandColor: '#000000', iconType: 'brain', sortOrder: 4005 },
  { id: 'icloud', name: 'iCloud', category: 'cloud', brandColor: '#3478F6', iconType: 'cloud', sortOrder: 5001 },
  { id: 'google-one', name: 'Google One', category: 'cloud', brandColor: '#4285F4', iconType: 'cloud', sortOrder: 5002 },
  { id: 'dropbox', name: 'Dropbox', category: 'cloud', brandColor: '#0061FF', iconType: 'cloud', sortOrder: 5003 },
  { id: 'onedrive', name: 'OneDrive', category: 'cloud', brandColor: '#0078D4', iconType: 'cloud', sortOrder: 5004 },
  { id: 'amazon-prime', name: 'Amazon Prime', category: 'shopping', brandColor: '#FF9900', iconType: 'cart', sortOrder: 6001 },
  { id: 'walmart-plus', name: 'Walmart+', category: 'shopping', brandColor: '#0071CE', iconType: 'cart', sortOrder: 6002 },
  { id: 'instacart', name: 'Instacart+', category: 'shopping', brandColor: '#43B02A', iconType: 'cart', sortOrder: 6003 },
  { id: 'doordash', name: 'DoorDash DashPass', category: 'shopping', brandColor: '#FF3008', iconType: 'cart', sortOrder: 6004 },
  { id: 'uber-one', name: 'Uber One', category: 'shopping', brandColor: '#000000', iconType: 'cart', sortOrder: 6005 },
  { id: 'shipt', name: 'Shipt', category: 'shopping', brandColor: '#C8102E', iconType: 'cart', sortOrder: 6006 },
  { id: 'thrive', name: 'Thrive Market', category: 'shopping', brandColor: '#2A5934', iconType: 'cart', sortOrder: 6007 },
  { id: 'chewy', name: 'Chewy Autoship', category: 'shopping', brandColor: '#0051A5', iconType: 'cart', sortOrder: 6008 },
  { id: 'adobe', name: 'Adobe CC', category: 'apps', brandColor: '#FF0000', iconType: 'phone', sortOrder: 7001 },
  { id: 'm365', name: 'Microsoft 365', category: 'apps', brandColor: '#D83B01', iconType: 'phone', sortOrder: 7002 },
  { id: 'duolingo', name: 'Duolingo Plus', category: 'apps', brandColor: '#58CC02', iconType: 'phone', sortOrder: 7003 },
  { id: 'nyt', name: 'New York Times', category: 'apps', brandColor: '#000000', iconType: 'phone', sortOrder: 7004 },
  { id: 'athletic', name: 'The Athletic', category: 'apps', brandColor: '#000000', iconType: 'phone', sortOrder: 7005 },
  { id: 'masterclass', name: 'MasterClass', category: 'apps', brandColor: '#000000', iconType: 'phone', sortOrder: 7006 },
  { id: 'peloton', name: 'Peloton', category: 'fitness', brandColor: '#E01F2D', iconType: 'dumbbell', sortOrder: 8001 },
  { id: 'strava', name: 'Strava', category: 'fitness', brandColor: '#FC4C02', iconType: 'dumbbell', sortOrder: 8002 },
  { id: 'mfp', name: 'MyFitnessPal', category: 'fitness', brandColor: '#0073E6', iconType: 'dumbbell', sortOrder: 8003 },
  { id: 'headspace', name: 'Headspace', category: 'fitness', brandColor: '#FF6200', iconType: 'dumbbell', sortOrder: 8004 },
  { id: 'ipsy', name: 'IPSY', category: 'lifestyle', brandColor: '#E91E8C', iconType: 'tree', sortOrder: 9001 },
  { id: 'stitch-fix', name: 'Stitch Fix', category: 'lifestyle', brandColor: '#2A4A7F', iconType: 'tree', sortOrder: 9002 },
  { id: 'fabfitfun', name: 'FabFitFun', category: 'lifestyle', brandColor: '#F2657A', iconType: 'tree', sortOrder: 9003 },
  { id: 'hellofresh', name: 'HelloFresh', category: 'lifestyle', brandColor: '#8DB600', iconType: 'tree', sortOrder: 9004 },
  { id: 'blue-apron', name: 'Blue Apron', category: 'lifestyle', brandColor: '#4B6CB7', iconType: 'tree', sortOrder: 9005 },
  { id: 'kiwico', name: 'KiwiCo', category: 'lifestyle', brandColor: '#E8792A', iconType: 'tree', sortOrder: 9006 },
  { id: 'barkbox', name: 'BarkBox', category: 'lifestyle', brandColor: '#4DBCE9', iconType: 'tree', sortOrder: 9007 },
];

const TIERS: Record<string, FirestoreServiceTierRow[]> = {
  netflix: [
    tierRow('netflix', 0, 'Standard with ads', 699, 'monthly'),
    tierRow('netflix', 1, 'Standard', 1549, 'monthly'),
    tierRow('netflix', 2, 'Premium', 2299, 'monthly'),
  ],
  'amazon-prime-video': [tierRow('amazon-prime-video', 0, 'Prime', 1499, 'monthly')],
  disney: [
    tierRow('disney', 0, 'Basic with ads', 799, 'monthly'),
    tierRow('disney', 1, 'Premium', 1399, 'monthly'),
  ],
  hbo: [
    tierRow('hbo', 0, 'With ads', 999, 'monthly'),
    tierRow('hbo', 1, 'Ad-free', 1599, 'monthly'),
  ],
  'youtube-premium': [
    tierRow('youtube-premium', 0, 'Individual', 1399, 'monthly'),
    tierRow('youtube-premium', 1, 'Family', 2299, 'monthly'),
    tierRow('youtube-premium', 2, 'Student', 799, 'monthly'),
  ],
  hulu: [
    tierRow('hulu', 0, 'With ads', 799, 'monthly'),
    tierRow('hulu', 1, 'No ads', 1799, 'monthly'),
    tierRow('hulu', 2, 'Live TV + ads', 8299, 'monthly'),
    tierRow('hulu', 3, 'Live TV no ads', 9599, 'monthly'),
  ],
  paramount: [
    tierRow('paramount', 0, 'Essential', 599, 'monthly'),
    tierRow('paramount', 1, 'Showtime bundle', 1199, 'monthly'),
  ],
  appletv: [tierRow('appletv', 0, 'Apple TV+', 999, 'monthly')],
  peacock: [
    tierRow('peacock', 0, 'Premium', 799, 'monthly'),
    tierRow('peacock', 1, 'Premium Plus', 1399, 'monthly'),
  ],
  crunchyroll: [
    tierRow('crunchyroll', 0, 'Fan', 799, 'monthly'),
    tierRow('crunchyroll', 1, 'Mega Fan', 999, 'monthly'),
    tierRow('crunchyroll', 2, 'Ultimate Fan', 1499, 'monthly'),
  ],
  spotify: [
    tierRow('spotify', 0, 'Individual', 1199, 'monthly'),
    tierRow('spotify', 1, 'Duo', 1699, 'monthly'),
    tierRow('spotify', 2, 'Family', 1999, 'monthly'),
    tierRow('spotify', 3, 'Student', 599, 'monthly'),
  ],
  'apple-music': [
    tierRow('apple-music', 0, 'Individual', 1099, 'monthly'),
    tierRow('apple-music', 1, 'Family', 1699, 'monthly'),
    tierRow('apple-music', 2, 'Student', 599, 'monthly'),
  ],
  tidal: [
    tierRow('tidal', 0, 'Individual', 1099, 'monthly'),
    tierRow('tidal', 1, 'Family', 1699, 'monthly'),
  ],
  'youtube-music': [
    tierRow('youtube-music', 0, 'Individual', 1099, 'monthly'),
    tierRow('youtube-music', 1, 'Family', 1699, 'monthly'),
    tierRow('youtube-music', 2, 'Student', 599, 'monthly'),
  ],
  audible: [
    tierRow('audible', 0, 'Plus', 795, 'monthly'),
    tierRow('audible', 1, 'Premium Plus', 1495, 'monthly'),
    tierRow('audible', 2, 'Premium Plus Two Credits', 2295, 'monthly'),
  ],
  'xbox-gp': [
    tierRow('xbox-gp', 0, 'Core', 999, 'monthly'),
    tierRow('xbox-gp', 1, 'Standard', 1499, 'monthly'),
    tierRow('xbox-gp', 2, 'Ultimate', 1999, 'monthly'),
  ],
  'ps-plus': [
    tierRow('ps-plus', 0, 'Essential', 999, 'monthly'),
    tierRow('ps-plus', 1, 'Extra', 1499, 'monthly'),
    tierRow('ps-plus', 2, 'Premium', 1799, 'monthly'),
  ],
  nintendo: [
    tierRow('nintendo', 0, 'Individual', 399, 'monthly'),
    tierRow('nintendo', 1, 'Family', 799, 'monthly'),
    tierRow('nintendo', 2, 'Individual + Expansion', 799, 'monthly'),
    tierRow('nintendo', 3, 'Family + Expansion', 1399, 'monthly'),
  ],
  chatgpt: [
    tierRow('chatgpt', 0, 'Plus', 2000, 'monthly'),
    tierRow('chatgpt', 1, 'Pro', 20000, 'monthly'),
  ],
  claude: [tierRow('claude', 0, 'Pro', 2000, 'monthly')],
  copilot: [tierRow('copilot', 0, 'Pro', 2000, 'monthly')],
  gemini: [tierRow('gemini', 0, 'Advanced', 1999, 'monthly')],
  midjourney: [
    tierRow('midjourney', 0, 'Basic', 1000, 'monthly'),
    tierRow('midjourney', 1, 'Standard', 3000, 'monthly'),
    tierRow('midjourney', 2, 'Pro', 6000, 'monthly'),
  ],
  icloud: [
    tierRow('icloud', 0, '50GB', 99, 'monthly'),
    tierRow('icloud', 1, '200GB', 299, 'monthly'),
    tierRow('icloud', 2, '2TB', 999, 'monthly'),
    tierRow('icloud', 3, '6TB', 2999, 'monthly'),
    tierRow('icloud', 4, '12TB', 5999, 'monthly'),
  ],
  'google-one': [
    tierRow('google-one', 0, '100GB', 199, 'monthly'),
    tierRow('google-one', 1, '200GB', 299, 'monthly'),
    tierRow('google-one', 2, '2TB', 999, 'monthly'),
  ],
  dropbox: [
    tierRow('dropbox', 0, 'Plus', 1199, 'monthly'),
    tierRow('dropbox', 1, 'Essentials', 2200, 'monthly'),
    tierRow('dropbox', 2, 'Business', 2400, 'monthly'),
  ],
  onedrive: [
    tierRow('onedrive', 0, '100GB', 199, 'monthly'),
    tierRow('onedrive', 1, 'Microsoft 365 Personal', 699, 'monthly'),
    tierRow('onedrive', 2, 'Family', 999, 'monthly'),
  ],
  'amazon-prime': [
    tierRow('amazon-prime', 0, 'Monthly', 1499, 'monthly'),
    tierRow('amazon-prime', 1, 'Annual', 13900, 'yearly'),
  ],
  'walmart-plus': [
    tierRow('walmart-plus', 0, 'Monthly', 1295, 'monthly'),
    tierRow('walmart-plus', 1, 'Annual', 9800, 'yearly'),
  ],
  instacart: [tierRow('instacart', 0, 'Instacart+', 999, 'monthly')],
  doordash: [tierRow('doordash', 0, 'DashPass', 999, 'monthly')],
  'uber-one': [
    tierRow('uber-one', 0, 'Monthly', 999, 'monthly'),
    tierRow('uber-one', 1, 'Annual', 9999, 'yearly'),
  ],
  shipt: [
    tierRow('shipt', 0, 'Monthly', 1400, 'monthly'),
    tierRow('shipt', 1, 'Annual', 9900, 'yearly'),
  ],
  thrive: [tierRow('thrive', 0, 'Annual', 5995, 'yearly')],
  chewy: [
    tierRow(
      'chewy',
      0,
      'Autoship',
      0,
      'monthly',
      'No fixed fee — discount applied automatically on autoship orders',
    ),
  ],
  adobe: [
    tierRow('adobe', 0, 'Photography', 1999, 'monthly'),
    tierRow('adobe', 1, 'All Apps', 5499, 'monthly'),
  ],
  m365: [
    tierRow('m365', 0, 'Personal', 699, 'monthly'),
    tierRow('m365', 1, 'Family', 999, 'monthly'),
  ],
  duolingo: [
    tierRow('duolingo', 0, 'Super', 699, 'monthly'),
    tierRow('duolingo', 1, 'Max', 1399, 'monthly'),
  ],
  nyt: [
    tierRow('nyt', 0, 'Basic', 1700, 'monthly'),
    tierRow('nyt', 1, 'All Access', 2500, 'monthly'),
  ],
  athletic: [
    tierRow('athletic', 0, 'Monthly', 1299, 'monthly'),
    tierRow('athletic', 1, 'Annual', 7999, 'yearly'),
  ],
  masterclass: [
    tierRow('masterclass', 0, 'Individual', 12000, 'yearly'),
    tierRow('masterclass', 1, 'Duo', 1500, 'monthly'),
    tierRow('masterclass', 2, 'Family', 2000, 'monthly'),
  ],
  peloton: [
    tierRow('peloton', 0, 'App+', 1299, 'monthly'),
    tierRow('peloton', 1, 'All-Access', 4400, 'monthly'),
  ],
  strava: [tierRow('strava', 0, 'Individual', 799, 'monthly')],
  mfp: [tierRow('mfp', 0, 'Premium', 999, 'monthly')],
  headspace: [
    tierRow('headspace', 0, 'Monthly', 1299, 'monthly'),
    tierRow('headspace', 1, 'Annual', 6999, 'yearly'),
    tierRow('headspace', 2, 'Family', 9999, 'yearly'),
  ],
  ipsy: [
    tierRow('ipsy', 0, 'Glam Bag', 1400, 'monthly'),
    tierRow('ipsy', 1, 'Glam Bag Plus', 3200, 'monthly'),
    tierRow('ipsy', 2, 'Glam Bag X', 5500, 'monthly'),
  ],
  'stitch-fix': [
    tierRow(
      'stitch-fix',
      0,
      'Styling',
      0,
      'monthly',
      'No subscription fee — $20 styling fee credited toward purchases',
    ),
  ],
  fabfitfun: [
    tierRow('fabfitfun', 0, 'Seasonal', 5499, 'monthly'),
    tierRow('fabfitfun', 1, 'Annual', 17999, 'yearly'),
  ],
  hellofresh: [
    tierRow(
      'hellofresh',
      0,
      'Meal plans',
      0,
      'monthly',
      'Price varies by plan — starts at $11.49/serving for 2 people, 2 meals',
    ),
  ],
  'blue-apron': [
    tierRow(
      'blue-apron',
      0,
      'Meal plans',
      0,
      'monthly',
      'Price varies by plan — starts at $7.99/serving',
    ),
  ],
  kiwico: [
    tierRow(
      'kiwico',
      0,
      'Crates',
      0,
      'monthly',
      'Price varies by age crate — $16.95 to $29.95/mo',
    ),
  ],
  barkbox: [
    tierRow('barkbox', 0, 'Monthly', 3500, 'monthly'),
    tierRow('barkbox', 1, '6-month', 2900, 'monthly'),
    tierRow('barkbox', 2, 'Annual', 2300, 'monthly'),
  ],
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
