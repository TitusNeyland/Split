import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured } from '../firebase';
import { parseFirestoreTiers, resolveServiceTierLookupKey, type ServiceTier, getStaticTiersForService } from './serviceTiers';

/** Firestore doc id: avoid `/` in paths (legacy name-based docs). */
function legacyServiceTiersDocId(serviceName: string): string {
  return resolveServiceTierLookupKey(serviceName).trim().replace(/\//g, '_');
}

/**
 * Loads `service_tiers/{serviceId}` (canonical catalog id, e.g. `netflix`).
 */
export async function fetchServiceTiersByServiceId(serviceId: string): Promise<ServiceTier[] | null> {
  if (!isFirebaseConfigured()) return null;
  const db = getFirebaseFirestore();
  const id = serviceId.trim();
  if (!db || !id) return null;
  try {
    const ref = doc(db, 'service_tiers', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as { tiers?: unknown };
    const parsed = parseFirestoreTiers(data.tiers);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Loads legacy `service_tiers/{normalizedName}.tiers`.
 * Returns `null` if missing, empty, or error — caller should fall back to static tiers.
 */
export async function fetchServiceTiersFromFirestore(serviceName: string): Promise<ServiceTier[] | null> {
  if (!isFirebaseConfigured()) return null;
  const db = getFirebaseFirestore();
  if (!db || !serviceName.trim()) return null;
  try {
    const ref = doc(db, 'service_tiers', legacyServiceTiersDocId(serviceName));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const parsed = parseFirestoreTiers(snap.data().tiers);
    return parsed;
  } catch {
    return null;
  }
}

/** Remote if non-empty; prefers `service_tiers/{serviceId}` when `serviceId` is set. */
export async function loadServiceTiersWithFallback(
  serviceName: string,
  serviceId?: string,
): Promise<ServiceTier[]> {
  if (serviceId?.trim()) {
    const byId = await fetchServiceTiersByServiceId(serviceId.trim());
    if (byId && byId.length > 0) return byId;
  }
  const remote = await fetchServiceTiersFromFirestore(serviceName);
  if (remote && remote.length > 0) return remote;
  return getStaticTiersForService(resolveServiceTierLookupKey(serviceName));
}
