import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured } from '../firebase';
import { parseFirestoreTiers, resolveServiceTierLookupKey, type ServiceTier, getStaticTiersForService } from './serviceTiers';

/** Firestore doc id: avoid `/` in paths. */
function serviceTiersDocId(serviceName: string): string {
  return resolveServiceTierLookupKey(serviceName).trim().replace(/\//g, '_');
}

/**
 * Loads `service_tiers/{serviceName}.tiers` (array of { name, price, cycle }).
 * Returns `null` if missing, empty, or error — caller should fall back to static tiers.
 */
export async function fetchServiceTiersFromFirestore(serviceName: string): Promise<ServiceTier[] | null> {
  if (!isFirebaseConfigured()) return null;
  const db = getFirebaseFirestore();
  if (!db || !serviceName.trim()) return null;
  try {
    const ref = doc(db, 'service_tiers', serviceTiersDocId(serviceName));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const parsed = parseFirestoreTiers(snap.data().tiers);
    return parsed;
  } catch {
    return null;
  }
}

/** Remote if non-empty, otherwise static list for the resolved lookup key (may be empty). */
export async function loadServiceTiersWithFallback(serviceName: string): Promise<ServiceTier[]> {
  const remote = await fetchServiceTiersFromFirestore(serviceName);
  if (remote && remote.length > 0) return remote;
  return getStaticTiersForService(resolveServiceTierLookupKey(serviceName));
}
