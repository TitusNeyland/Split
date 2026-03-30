/**
 * Seeds `services` and `service_tiers` from bundled fallback catalog.
 *
 * Requires a Firebase **service account JSON** (not your personal Google login).
 * Set one of:
 *   GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_SERVICE_ACCOUNT_PATH
 * to the full path of that file, then:
 *
 *   npm run seed:services
 */
import { existsSync, readFileSync } from 'fs';
import admin from 'firebase-admin';
import { FALLBACK_SERVICES, FALLBACK_TIERS_BY_SERVICE_ID } from '../lib/subscription/servicesCatalogFallback';

const credPath = (
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  ''
).trim();

if (!credPath || !existsSync(credPath)) {
  console.error(`
Could not find a service account JSON file.

1. Firebase Console → Project settings → Service accounts → "Generate new private key"
2. Save the file locally (add to .gitignore; never commit it)
3. PowerShell (example):
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\your-project-firebase-adminsdk-xxxxx.json"
   npm run seed:services

(You can use FIREBASE_SERVICE_ACCOUNT_PATH instead of GOOGLE_APPLICATION_CREDENTIALS.)
`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8')) as admin.ServiceAccount;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function main() {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();
  let n = 0;

  for (const s of FALLBACK_SERVICES) {
    const ref = db.collection('services').doc(s.id);
    batch.set(ref, {
      serviceId: s.serviceId,
      name: s.name,
      category: s.category,
      brandColor: s.brandColor,
      iconType: s.iconType,
      isActive: true,
      sortOrder: s.sortOrder,
      createdAt: ts,
      updatedAt: ts,
    });
    n++;
  }

  for (const [id, tiers] of Object.entries(FALLBACK_TIERS_BY_SERVICE_ID)) {
    const ref = db.collection('service_tiers').doc(id);
    batch.set(ref, {
      serviceId: id,
      tiers: tiers.map((t) => ({
        ...t,
        lastPriceUpdatedAt: now,
      })),
      updatedAt: ts,
    });
    n++;
  }

  if (n > 500) {
    throw new Error('Batch too large; split commits');
  }
  await batch.commit();
  console.log(
    `Seeded ${FALLBACK_SERVICES.length} services and ${Object.keys(FALLBACK_TIERS_BY_SERVICE_ID).length} tier docs.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
