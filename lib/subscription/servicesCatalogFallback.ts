/**
 * Bundled fallback when Firestore is unavailable (first launch / offline).
 * Keep in sync with Firestore seed and `scripts/seedServices.js`. After editing, run `npm run seed:services`
 * (with service account credentials) for hosted Firestore, or `npm run seed:services:js` if you use the JS seed path.
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
  { id: 'appletv', name: 'Apple TV', category: 'streaming', brandColor: '#000000', iconType: 'tv-screen', sortOrder: 1008 },
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
  { id: 'ea-play', name: 'EA Play', category: 'gaming', brandColor: '#000000', iconType: 'gamepad', sortOrder: 3004 },
  { id: 'apple-arcade', name: 'Apple Arcade', category: 'gaming', brandColor: '#7D57C1', iconType: 'gamepad', sortOrder: 3005 },
  { id: 'google-play-pass', name: 'Google Play Pass', category: 'gaming', brandColor: '#01875F', iconType: 'gamepad', sortOrder: 3006 },
  { id: 'ubisoft-plus', name: 'Ubisoft+', category: 'gaming', brandColor: '#0474B5', iconType: 'gamepad', sortOrder: 3007 },
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
  { id: 'sams-club', name: "Sam's Club", category: 'shopping', brandColor: '#0073CE', iconType: 'cart', sortOrder: 6009 },
  { id: 'costco', name: 'Costco', category: 'shopping', brandColor: '#005DAA', iconType: 'cart', sortOrder: 6010 },
  { id: 'bjs', name: "BJ's Wholesale", category: 'shopping', brandColor: '#E31837', iconType: 'cart', sortOrder: 6011 },
  { id: 'target-circle', name: 'Target Circle 360', category: 'shopping', brandColor: '#CC0000', iconType: 'cart', sortOrder: 6012 },
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
    tierRow('netflix', 0, 'Standard with ads', 899, 'monthly'),
    tierRow('netflix', 1, 'Standard', 1999, 'monthly'),
    tierRow('netflix', 2, 'Premium', 2699, 'monthly'),
  ],
  'amazon-prime-video': [tierRow('amazon-prime-video', 0, 'Prime Video (standalone)', 899, 'monthly')],
  disney: [
    tierRow('disney', 0, 'Basic (with ads)', 1199, 'monthly'),
    tierRow('disney', 1, 'Premium (no ads)', 1899, 'monthly'),
  ],
  hbo: [
    tierRow('hbo', 0, 'Basic with ads', 1099, 'monthly'),
    tierRow('hbo', 1, 'Standard', 1849, 'monthly'),
    tierRow('hbo', 2, 'Premium', 2299, 'monthly'),
  ],
  'youtube-premium': [
    tierRow('youtube-premium', 0, 'Individual', 1599, 'monthly'),
    tierRow('youtube-premium', 1, 'Family (up to 6 members)', 2699, 'monthly'),
    tierRow('youtube-premium', 2, 'Student', 899, 'monthly'),
  ],
  hulu: [
    tierRow('hulu', 0, 'Hulu (With Ads)', 1199, 'monthly'),
    tierRow('hulu', 1, 'Hulu (No Ads)', 1899, 'monthly'),
    tierRow(
      'hulu',
      2,
      'Hulu + Live TV, Disney+, ESPN Select (with ads)',
      8999,
      'monthly',
    ),
    tierRow(
      'hulu',
      3,
      'Hulu + Live TV, Disney+, ESPN Select (no ads on Hulu & Disney+)',
      9999,
      'monthly',
    ),
    tierRow('hulu', 4, 'Live TV Only', 8899, 'monthly'),
    tierRow('hulu', 5, 'Hulu + Live TV Español, Disney+', 2999, 'monthly'),
    tierRow('hulu', 6, 'Live TV Only Español', 2899, 'monthly'),
  ],
  paramount: [
    tierRow('paramount', 0, 'Essential (with ads)', 900, 'monthly'),
    tierRow('paramount', 1, 'Premium (no ads)', 1400, 'monthly'),
  ],
  appletv: [tierRow('appletv', 0, 'Apple TV', 1299, 'monthly')],
  peacock: [
    tierRow('peacock', 0, 'Select', 799, 'monthly'),
    tierRow('peacock', 1, 'Standard', 1099, 'monthly'),
    tierRow('peacock', 2, 'Premium Plus', 1699, 'monthly'),
  ],
  crunchyroll: [
    tierRow('crunchyroll', 0, 'Fan', 1000, 'monthly'),
    tierRow('crunchyroll', 1, 'Mega Fan', 1400, 'monthly'),
    tierRow('crunchyroll', 2, 'Ultimate Fan', 1800, 'monthly'),
  ],
  spotify: [
    tierRow('spotify', 0, 'Individual', 1299, 'monthly'),
    tierRow('spotify', 1, 'Duo', 1899, 'monthly'),
    tierRow('spotify', 2, 'Family', 2199, 'monthly'),
    tierRow('spotify', 3, 'Student', 699, 'monthly'),
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
    tierRow('youtube-music', 0, 'Individual', 1199, 'monthly'),
    tierRow('youtube-music', 1, 'Family', 1899, 'monthly'),
    tierRow('youtube-music', 2, 'Student', 599, 'monthly'),
  ],
  audible: [
    tierRow('audible', 0, 'Plus', 795, 'monthly'),
    tierRow('audible', 1, 'Premium Plus', 1495, 'monthly'),
    tierRow('audible', 2, 'Premium Plus Two Credits', 2295, 'monthly'),
  ],
  'xbox-gp': [
    tierRow('xbox-gp', 0, 'Essential', 999, 'monthly'),
    tierRow('xbox-gp', 1, 'Premium', 1499, 'monthly'),
    tierRow('xbox-gp', 2, 'Ultimate', 2999, 'monthly'),
  ],
  'ps-plus': [
    tierRow('ps-plus', 0, 'Essential', 999, 'monthly'),
    tierRow('ps-plus', 1, 'Extra', 1499, 'monthly'),
    tierRow('ps-plus', 2, 'Premium', 1799, 'monthly'),
  ],
  nintendo: [
    tierRow('nintendo', 0, 'Individual', 399, 'monthly'),
    tierRow('nintendo', 1, 'Family', 799, 'monthly'),
    tierRow('nintendo', 2, 'Individual + Expansion Pack', 4999, 'yearly'),
    tierRow('nintendo', 3, 'Family + Expansion Pack', 7999, 'yearly'),
  ],
  'ea-play': [
    tierRow('ea-play', 0, 'EA Play', 600, 'monthly'),
    tierRow('ea-play', 1, 'EA Play (Annual)', 4000, 'yearly'),
    tierRow('ea-play', 2, 'EA Play Pro', 1700, 'monthly'),
    tierRow('ea-play', 3, 'EA Play Pro (Annual)', 12000, 'yearly'),
  ],
  'apple-arcade': [
    tierRow('apple-arcade', 0, 'Monthly', 500, 'monthly'),
    tierRow('apple-arcade', 1, 'Annual', 5000, 'yearly'),
  ],
  'google-play-pass': [
    tierRow('google-play-pass', 0, 'Monthly', 500, 'monthly'),
    tierRow('google-play-pass', 1, 'Annual', 3000, 'yearly'),
  ],
  'ubisoft-plus': [
    tierRow('ubisoft-plus', 0, 'Classics', 799, 'monthly'),
    tierRow('ubisoft-plus', 1, 'Premium', 1799, 'monthly'),
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
    tierRow('onedrive', 1, 'Microsoft 365 Personal', 999, 'monthly'),
    tierRow('onedrive', 2, 'Microsoft 365 Family', 1299, 'monthly'),
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
    tierRow('shipt', 0, 'Monthly', 1099, 'monthly'),
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
  'sams-club': [
    tierRow('sams-club', 0, 'Club', 6000, 'yearly'),
    tierRow('sams-club', 1, 'Club Plus', 12000, 'yearly'),
  ],
  costco: [
    tierRow('costco', 0, 'Gold Star', 6500, 'yearly'),
    tierRow('costco', 1, 'Executive', 13500, 'yearly'),
  ],
  bjs: [
    tierRow('bjs', 0, 'Club', 6000, 'yearly'),
    tierRow('bjs', 1, 'Club+', 12000, 'yearly'),
  ],
  'target-circle': [
    tierRow('target-circle', 0, 'Monthly', 1099, 'monthly'),
    tierRow('target-circle', 1, 'Annual', 9900, 'yearly'),
  ],
  adobe: [
    tierRow('adobe', 0, 'Creative Cloud Standard', 5499, 'monthly'),
    tierRow('adobe', 1, 'Creative Cloud Pro', 6999, 'monthly'),
  ],
  m365: [
    tierRow('m365', 0, 'Personal', 999, 'monthly'),
    tierRow('m365', 1, 'Family', 1299, 'monthly'),
  ],
  duolingo: [
    tierRow('duolingo', 0, 'Super', 1299, 'monthly'),
    tierRow('duolingo', 1, 'Max', 2999, 'monthly'),
  ],
  nyt: [
    tierRow('nyt', 0, 'Basic', 2000, 'monthly'),
    tierRow('nyt', 1, 'All Access', 2500, 'monthly'),
  ],
  athletic: [
    tierRow('athletic', 0, 'Monthly', 899, 'monthly'),
    tierRow('athletic', 1, 'Annual', 7188, 'yearly'),
  ],
  masterclass: [
    tierRow('masterclass', 0, 'Individual', 12000, 'yearly'),
    tierRow('masterclass', 1, 'Duo', 1500, 'monthly'),
    tierRow('masterclass', 2, 'Family', 2000, 'monthly'),
  ],
  peloton: [
    tierRow('peloton', 0, 'App One', 1299, 'monthly'),
    tierRow('peloton', 1, 'App+', 2899, 'monthly'),
    tierRow('peloton', 2, 'All-Access (equipment)', 4999, 'monthly'),
  ],
  strava: [tierRow('strava', 0, 'Individual', 1199, 'monthly')],
  mfp: [
    tierRow('mfp', 0, 'Premium', 1999, 'monthly'),
    tierRow('mfp', 1, 'Premium+', 2499, 'monthly'),
  ],
  headspace: [
    tierRow('headspace', 0, 'Monthly', 1299, 'monthly'),
    tierRow('headspace', 1, 'Annual', 6999, 'yearly'),
    tierRow('headspace', 2, 'Family', 9999, 'yearly'),
  ],
  ipsy: [
    tierRow('ipsy', 0, 'Glam Bag', 1500, 'monthly'),
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
