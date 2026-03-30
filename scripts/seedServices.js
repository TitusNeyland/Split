/**
 * Seeds `services` and `service_tiers` collections (52 subscription services).
 *
 * Place your Firebase service account JSON next to this file as `serviceAccountKey.json`
 * (add to .gitignore; never commit it), then:
 *   node scripts/seedServices.js
 */
const admin = require('firebase-admin');

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch {
  console.error(
    'Missing scripts/serviceAccountKey.json. Download a service account key from Firebase Console → Project settings → Service accounts.',
  );
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

/** @type {{ serviceId: string; name: string; category: string; brandColor: string; sortOrder: number }[]} */
const SERVICES = [
  { serviceId: 'netflix', name: 'Netflix', category: 'streaming', brandColor: '#E50914', sortOrder: 1001 },
  {
    serviceId: 'amazon-prime-video',
    name: 'Amazon Prime Video',
    category: 'streaming',
    brandColor: '#00A8E1',
    sortOrder: 1002,
  },
  { serviceId: 'disney', name: 'Disney+', category: 'streaming', brandColor: '#113CCF', sortOrder: 1003 },
  { serviceId: 'hbo', name: 'HBO Max', category: 'streaming', brandColor: '#5822B2', sortOrder: 1004 },
  {
    serviceId: 'youtube-premium',
    name: 'YouTube Premium',
    category: 'streaming',
    brandColor: '#FF0000',
    sortOrder: 1005,
  },
  { serviceId: 'hulu', name: 'Hulu', category: 'streaming', brandColor: '#1CE783', sortOrder: 1006 },
  { serviceId: 'paramount', name: 'Paramount+', category: 'streaming', brandColor: '#0064FF', sortOrder: 1007 },
  { serviceId: 'appletv', name: 'Apple TV+', category: 'streaming', brandColor: '#000000', sortOrder: 1008 },
  { serviceId: 'peacock', name: 'Peacock', category: 'streaming', brandColor: '#000000', sortOrder: 1009 },
  { serviceId: 'crunchyroll', name: 'Crunchyroll', category: 'streaming', brandColor: '#F47521', sortOrder: 1010 },
  { serviceId: 'spotify', name: 'Spotify', category: 'music', brandColor: '#1DB954', sortOrder: 2001 },
  { serviceId: 'apple-music', name: 'Apple Music', category: 'music', brandColor: '#FC3C44', sortOrder: 2002 },
  { serviceId: 'tidal', name: 'Tidal', category: 'music', brandColor: '#000000', sortOrder: 2003 },
  { serviceId: 'youtube-music', name: 'YouTube Music', category: 'music', brandColor: '#FF0000', sortOrder: 2004 },
  { serviceId: 'audible', name: 'Audible', category: 'music', brandColor: '#FF9900', sortOrder: 2005 },
  { serviceId: 'xbox-gp', name: 'Xbox Game Pass', category: 'gaming', brandColor: '#107C10', sortOrder: 3001 },
  { serviceId: 'ps-plus', name: 'PlayStation Plus', category: 'gaming', brandColor: '#003791', sortOrder: 3002 },
  { serviceId: 'nintendo', name: 'Nintendo Online', category: 'gaming', brandColor: '#E4000F', sortOrder: 3003 },
  { serviceId: 'chatgpt', name: 'ChatGPT Plus', category: 'ai', brandColor: '#10A37F', sortOrder: 4001 },
  { serviceId: 'claude', name: 'Claude Pro', category: 'ai', brandColor: '#CC785C', sortOrder: 4002 },
  { serviceId: 'copilot', name: 'Copilot Pro', category: 'ai', brandColor: '#0078D4', sortOrder: 4003 },
  { serviceId: 'gemini', name: 'Gemini Advanced', category: 'ai', brandColor: '#4285F4', sortOrder: 4004 },
  { serviceId: 'midjourney', name: 'Midjourney', category: 'ai', brandColor: '#000000', sortOrder: 4005 },
  { serviceId: 'icloud', name: 'iCloud', category: 'cloud', brandColor: '#3478F6', sortOrder: 5001 },
  { serviceId: 'google-one', name: 'Google One', category: 'cloud', brandColor: '#4285F4', sortOrder: 5002 },
  { serviceId: 'dropbox', name: 'Dropbox', category: 'cloud', brandColor: '#0061FF', sortOrder: 5003 },
  { serviceId: 'onedrive', name: 'OneDrive', category: 'cloud', brandColor: '#0078D4', sortOrder: 5004 },
  { serviceId: 'amazon-prime', name: 'Amazon Prime', category: 'shopping', brandColor: '#FF9900', sortOrder: 6001 },
  { serviceId: 'walmart-plus', name: 'Walmart+', category: 'shopping', brandColor: '#0071CE', sortOrder: 6002 },
  { serviceId: 'instacart', name: 'Instacart+', category: 'shopping', brandColor: '#43B02A', sortOrder: 6003 },
  { serviceId: 'doordash', name: 'DoorDash DashPass', category: 'shopping', brandColor: '#FF3008', sortOrder: 6004 },
  { serviceId: 'uber-one', name: 'Uber One', category: 'shopping', brandColor: '#000000', sortOrder: 6005 },
  { serviceId: 'shipt', name: 'Shipt', category: 'shopping', brandColor: '#C8102E', sortOrder: 6006 },
  { serviceId: 'thrive', name: 'Thrive Market', category: 'shopping', brandColor: '#2A5934', sortOrder: 6007 },
  { serviceId: 'chewy', name: 'Chewy Autoship', category: 'shopping', brandColor: '#0051A5', sortOrder: 6008 },
  { serviceId: 'adobe', name: 'Adobe CC', category: 'apps', brandColor: '#FF0000', sortOrder: 7001 },
  { serviceId: 'm365', name: 'Microsoft 365', category: 'apps', brandColor: '#D83B01', sortOrder: 7002 },
  { serviceId: 'duolingo', name: 'Duolingo Plus', category: 'apps', brandColor: '#58CC02', sortOrder: 7003 },
  { serviceId: 'nyt', name: 'New York Times', category: 'apps', brandColor: '#000000', sortOrder: 7004 },
  { serviceId: 'athletic', name: 'The Athletic', category: 'apps', brandColor: '#000000', sortOrder: 7005 },
  { serviceId: 'masterclass', name: 'MasterClass', category: 'apps', brandColor: '#000000', sortOrder: 7006 },
  { serviceId: 'peloton', name: 'Peloton', category: 'fitness', brandColor: '#E01F2D', sortOrder: 8001 },
  { serviceId: 'strava', name: 'Strava', category: 'fitness', brandColor: '#FC4C02', sortOrder: 8002 },
  { serviceId: 'mfp', name: 'MyFitnessPal', category: 'fitness', brandColor: '#0073E6', sortOrder: 8003 },
  { serviceId: 'headspace', name: 'Headspace', category: 'fitness', brandColor: '#FF6200', sortOrder: 8004 },
  { serviceId: 'ipsy', name: 'IPSY', category: 'lifestyle', brandColor: '#E91E8C', sortOrder: 9001 },
  { serviceId: 'stitch-fix', name: 'Stitch Fix', category: 'lifestyle', brandColor: '#2A4A7F', sortOrder: 9002 },
  { serviceId: 'fabfitfun', name: 'FabFitFun', category: 'lifestyle', brandColor: '#F2657A', sortOrder: 9003 },
  { serviceId: 'hellofresh', name: 'HelloFresh', category: 'lifestyle', brandColor: '#8DB600', sortOrder: 9004 },
  { serviceId: 'blue-apron', name: 'Blue Apron', category: 'lifestyle', brandColor: '#4B6CB7', sortOrder: 9005 },
  { serviceId: 'kiwico', name: 'KiwiCo', category: 'lifestyle', brandColor: '#E8792A', sortOrder: 9006 },
  { serviceId: 'barkbox', name: 'BarkBox', category: 'lifestyle', brandColor: '#4DBCE9', sortOrder: 9007 },
];

/** @type {Record<string, { name: string; priceCents: number; billingCycle: 'monthly' | 'yearly'; priceChangeNote?: string | null }[]>} */
const SERVICE_TIERS = {
  netflix: [
    { name: 'Standard with ads', priceCents: 699, billingCycle: 'monthly' },
    { name: 'Standard', priceCents: 1549, billingCycle: 'monthly' },
    { name: 'Premium', priceCents: 2299, billingCycle: 'monthly' },
  ],
  'amazon-prime-video': [{ name: 'Prime', priceCents: 1499, billingCycle: 'monthly' }],
  disney: [
    { name: 'Basic with ads', priceCents: 799, billingCycle: 'monthly' },
    { name: 'Premium', priceCents: 1399, billingCycle: 'monthly' },
  ],
  hbo: [
    { name: 'With ads', priceCents: 999, billingCycle: 'monthly' },
    { name: 'Ad-free', priceCents: 1599, billingCycle: 'monthly' },
  ],
  'youtube-premium': [
    { name: 'Individual', priceCents: 1399, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 2299, billingCycle: 'monthly' },
    { name: 'Student', priceCents: 799, billingCycle: 'monthly' },
  ],
  hulu: [
    { name: 'With ads', priceCents: 799, billingCycle: 'monthly' },
    { name: 'No ads', priceCents: 1799, billingCycle: 'monthly' },
    { name: 'Live TV + ads', priceCents: 8299, billingCycle: 'monthly' },
    { name: 'Live TV no ads', priceCents: 9599, billingCycle: 'monthly' },
  ],
  paramount: [
    { name: 'Essential', priceCents: 599, billingCycle: 'monthly' },
    { name: 'Showtime bundle', priceCents: 1199, billingCycle: 'monthly' },
  ],
  appletv: [{ name: 'Apple TV+', priceCents: 999, billingCycle: 'monthly' }],
  peacock: [
    { name: 'Premium', priceCents: 799, billingCycle: 'monthly' },
    { name: 'Premium Plus', priceCents: 1399, billingCycle: 'monthly' },
  ],
  crunchyroll: [
    { name: 'Fan', priceCents: 799, billingCycle: 'monthly' },
    { name: 'Mega Fan', priceCents: 999, billingCycle: 'monthly' },
    { name: 'Ultimate Fan', priceCents: 1499, billingCycle: 'monthly' },
  ],
  spotify: [
    { name: 'Individual', priceCents: 1199, billingCycle: 'monthly' },
    { name: 'Duo', priceCents: 1699, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 1999, billingCycle: 'monthly' },
    { name: 'Student', priceCents: 599, billingCycle: 'monthly' },
  ],
  'apple-music': [
    { name: 'Individual', priceCents: 1099, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 1699, billingCycle: 'monthly' },
    { name: 'Student', priceCents: 599, billingCycle: 'monthly' },
  ],
  tidal: [
    { name: 'Individual', priceCents: 1099, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 1699, billingCycle: 'monthly' },
  ],
  'youtube-music': [
    { name: 'Individual', priceCents: 1099, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 1699, billingCycle: 'monthly' },
    { name: 'Student', priceCents: 599, billingCycle: 'monthly' },
  ],
  audible: [
    { name: 'Plus', priceCents: 795, billingCycle: 'monthly' },
    { name: 'Premium Plus', priceCents: 1495, billingCycle: 'monthly' },
    { name: 'Premium Plus Two Credits', priceCents: 2295, billingCycle: 'monthly' },
  ],
  'xbox-gp': [
    { name: 'Core', priceCents: 999, billingCycle: 'monthly' },
    { name: 'Standard', priceCents: 1499, billingCycle: 'monthly' },
    { name: 'Ultimate', priceCents: 1999, billingCycle: 'monthly' },
  ],
  'ps-plus': [
    { name: 'Essential', priceCents: 999, billingCycle: 'monthly' },
    { name: 'Extra', priceCents: 1499, billingCycle: 'monthly' },
    { name: 'Premium', priceCents: 1799, billingCycle: 'monthly' },
  ],
  nintendo: [
    { name: 'Individual', priceCents: 399, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 799, billingCycle: 'monthly' },
    { name: 'Individual + Expansion', priceCents: 799, billingCycle: 'monthly' },
    { name: 'Family + Expansion', priceCents: 1399, billingCycle: 'monthly' },
  ],
  chatgpt: [
    { name: 'Plus', priceCents: 2000, billingCycle: 'monthly' },
    { name: 'Pro', priceCents: 20000, billingCycle: 'monthly' },
  ],
  claude: [{ name: 'Pro', priceCents: 2000, billingCycle: 'monthly' }],
  copilot: [{ name: 'Pro', priceCents: 2000, billingCycle: 'monthly' }],
  gemini: [{ name: 'Advanced', priceCents: 1999, billingCycle: 'monthly' }],
  midjourney: [
    { name: 'Basic', priceCents: 1000, billingCycle: 'monthly' },
    { name: 'Standard', priceCents: 3000, billingCycle: 'monthly' },
    { name: 'Pro', priceCents: 6000, billingCycle: 'monthly' },
  ],
  icloud: [
    { name: '50GB', priceCents: 99, billingCycle: 'monthly' },
    { name: '200GB', priceCents: 299, billingCycle: 'monthly' },
    { name: '2TB', priceCents: 999, billingCycle: 'monthly' },
    { name: '6TB', priceCents: 2999, billingCycle: 'monthly' },
    { name: '12TB', priceCents: 5999, billingCycle: 'monthly' },
  ],
  'google-one': [
    { name: '100GB', priceCents: 199, billingCycle: 'monthly' },
    { name: '200GB', priceCents: 299, billingCycle: 'monthly' },
    { name: '2TB', priceCents: 999, billingCycle: 'monthly' },
  ],
  dropbox: [
    { name: 'Plus', priceCents: 1199, billingCycle: 'monthly' },
    { name: 'Essentials', priceCents: 2200, billingCycle: 'monthly' },
    { name: 'Business', priceCents: 2400, billingCycle: 'monthly' },
  ],
  onedrive: [
    { name: '100GB', priceCents: 199, billingCycle: 'monthly' },
    { name: 'Microsoft 365 Personal', priceCents: 699, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 999, billingCycle: 'monthly' },
  ],
  'amazon-prime': [
    { name: 'Monthly', priceCents: 1499, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 13900, billingCycle: 'yearly' },
  ],
  'walmart-plus': [
    { name: 'Monthly', priceCents: 1295, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 9800, billingCycle: 'yearly' },
  ],
  instacart: [{ name: 'Instacart+', priceCents: 999, billingCycle: 'monthly' }],
  doordash: [{ name: 'DashPass', priceCents: 999, billingCycle: 'monthly' }],
  'uber-one': [
    { name: 'Monthly', priceCents: 999, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 9999, billingCycle: 'yearly' },
  ],
  shipt: [
    { name: 'Monthly', priceCents: 1400, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 9900, billingCycle: 'yearly' },
  ],
  thrive: [{ name: 'Annual', priceCents: 5995, billingCycle: 'yearly' }],
  chewy: [
    {
      name: 'Autoship',
      priceCents: 0,
      billingCycle: 'monthly',
      priceChangeNote: 'No fixed fee — discount applied automatically on autoship orders',
    },
  ],
  adobe: [
    { name: 'Photography', priceCents: 1999, billingCycle: 'monthly' },
    { name: 'All Apps', priceCents: 5499, billingCycle: 'monthly' },
  ],
  m365: [
    { name: 'Personal', priceCents: 699, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 999, billingCycle: 'monthly' },
  ],
  duolingo: [
    { name: 'Super', priceCents: 699, billingCycle: 'monthly' },
    { name: 'Max', priceCents: 1399, billingCycle: 'monthly' },
  ],
  nyt: [
    { name: 'Basic', priceCents: 1700, billingCycle: 'monthly' },
    { name: 'All Access', priceCents: 2500, billingCycle: 'monthly' },
  ],
  athletic: [
    { name: 'Monthly', priceCents: 1299, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 7999, billingCycle: 'yearly' },
  ],
  masterclass: [
    { name: 'Individual', priceCents: 12000, billingCycle: 'yearly' },
    { name: 'Duo', priceCents: 1500, billingCycle: 'monthly' },
    { name: 'Family', priceCents: 2000, billingCycle: 'monthly' },
  ],
  peloton: [
    { name: 'App+', priceCents: 1299, billingCycle: 'monthly' },
    { name: 'All-Access', priceCents: 4400, billingCycle: 'monthly' },
  ],
  strava: [{ name: 'Individual', priceCents: 799, billingCycle: 'monthly' }],
  mfp: [{ name: 'Premium', priceCents: 999, billingCycle: 'monthly' }],
  headspace: [
    { name: 'Monthly', priceCents: 1299, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 6999, billingCycle: 'yearly' },
    { name: 'Family', priceCents: 9999, billingCycle: 'yearly' },
  ],
  ipsy: [
    { name: 'Glam Bag', priceCents: 1400, billingCycle: 'monthly' },
    { name: 'Glam Bag Plus', priceCents: 3200, billingCycle: 'monthly' },
    { name: 'Glam Bag X', priceCents: 5500, billingCycle: 'monthly' },
  ],
  'stitch-fix': [
    {
      name: 'Styling',
      priceCents: 0,
      billingCycle: 'monthly',
      priceChangeNote: 'No subscription fee — $20 styling fee credited toward purchases',
    },
  ],
  fabfitfun: [
    { name: 'Seasonal', priceCents: 5499, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 17999, billingCycle: 'yearly' },
  ],
  hellofresh: [
    {
      name: 'Meal plans',
      priceCents: 0,
      billingCycle: 'monthly',
      priceChangeNote: 'Price varies by plan — starts at $11.49/serving for 2 people, 2 meals',
    },
  ],
  'blue-apron': [
    {
      name: 'Meal plans',
      priceCents: 0,
      billingCycle: 'monthly',
      priceChangeNote: 'Price varies by plan — starts at $7.99/serving',
    },
  ],
  kiwico: [
    {
      name: 'Crates',
      priceCents: 0,
      billingCycle: 'monthly',
      priceChangeNote: 'Price varies by age crate — $16.95 to $29.95/mo',
    },
  ],
  barkbox: [
    { name: 'Monthly', priceCents: 3500, billingCycle: 'monthly' },
    { name: '6-month', priceCents: 2900, billingCycle: 'monthly' },
    { name: 'Annual', priceCents: 2300, billingCycle: 'monthly' },
  ],
};

async function seed() {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  let ops = 0;

  for (const service of SERVICES) {
    const ref = db.collection('services').doc(service.serviceId);
    batch.set(ref, {
      serviceId: service.serviceId,
      name: service.name,
      category: service.category,
      brandColor: service.brandColor,
      isActive: true,
      sortOrder: service.sortOrder,
      createdAt: ts,
      updatedAt: ts,
    });
    ops++;
  }

  for (const [serviceId, tiers] of Object.entries(SERVICE_TIERS)) {
    const ref = db.collection('service_tiers').doc(serviceId);
    batch.set(ref, {
      serviceId,
      tiers: tiers.map((t, idx) => ({
        tierId: `${serviceId}_${idx}`,
        name: t.name,
        priceCents: t.priceCents,
        billingCycle: t.billingCycle,
        isActive: true,
        sortOrder: idx,
        lastPriceUpdatedAt: ts,
        priceChangeNote: t.priceChangeNote ?? null,
      })),
      updatedAt: ts,
    });
    ops++;
  }

  if (ops > 500) {
    throw new Error('Batch exceeds Firestore limit; split into multiple commits.');
  }

  await batch.commit();
  console.log(`Seed complete — ${SERVICES.length} services and ${Object.keys(SERVICE_TIERS).length} tier docs written to Firestore`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
