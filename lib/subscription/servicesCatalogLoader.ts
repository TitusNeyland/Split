import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured } from '../firebase';
import type { CatalogService, FirestoreServiceTierRow, ServicesCatalogSnapshot } from './servicesCatalogTypes';
import {
  FALLBACK_SERVICES,
  FALLBACK_TIERS_BY_SERVICE_ID,
} from './servicesCatalogFallback';

export const CACHE_KEY_SERVICES = 'cached_services_v1';
export const CACHE_KEY_TIERS = 'cached_tiers_v1';
export const CACHE_KEY_TS = 'cached_services_v1_ts';
export const CACHE_TTL_MS = __DEV__ ? 30 * 1000 : 24 * 60 * 60 * 1000;

function minPriceCentsForTiers(tiers: FirestoreServiceTierRow[] | undefined): number {
  if (!tiers || tiers.length === 0) return 0;
  const active = tiers.filter((t) => t.isActive !== false);
  const positives = active.map((t) => t.priceCents).filter((c) => typeof c === 'number' && c > 0);
  if (positives.length) return Math.round(Math.min(...positives));
  const hasFree = active.some((t) => t.priceCents === 0);
  return hasFree ? 0 : 0;
}

function normalizeServiceDoc(id: string, data: Record<string, unknown>): CatalogService | null {
  const serviceId = typeof data.serviceId === 'string' && data.serviceId.trim() ? data.serviceId.trim() : id;
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : '';
  const catRaw = data.category;
  const category =
    typeof catRaw === 'string' &&
    ['streaming', 'music', 'gaming', 'ai', 'cloud', 'shopping', 'apps', 'fitness'].includes(catRaw)
      ? (catRaw as CatalogService['category'])
      : null;
  if (!category) return null;
  const brandColor = typeof data.brandColor === 'string' && data.brandColor.trim() ? data.brandColor.trim() : '#5F5E5A';
  const iconType = typeof data.iconType === 'string' && data.iconType.trim() ? data.iconType.trim() : 'tv-screen';
  const isActive = data.isActive !== false;
  const sortOrder = typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder) ? data.sortOrder : 0;
  const priceCentsMin =
    typeof data.priceCentsMin === 'number' && Number.isFinite(data.priceCentsMin)
      ? Math.round(data.priceCentsMin)
      : 0;
  if (!name || !isActive) return null;
  return {
    id,
    serviceId,
    name,
    category,
    brandColor,
    iconType,
    isActive,
    sortOrder,
    priceCentsMin,
  };
}

function attachMinPrices(
  services: CatalogService[],
  tiersMap: Record<string, FirestoreServiceTierRow[]>
): CatalogService[] {
  return services.map((s) => {
    const tiers = tiersMap[s.serviceId] ?? tiersMap[s.id];
    const computed = minPriceCentsForTiers(tiers);
    if (computed > 0) return { ...s, priceCentsMin: computed };
    if (s.priceCentsMin > 0) return { ...s, priceCentsMin: s.priceCentsMin };
    return { ...s, priceCentsMin: computed };
  });
}

async function readSnapshotFromCache(): Promise<ServicesCatalogSnapshot | null> {
  try {
    const [rawS, rawT, rawTs] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY_SERVICES),
      AsyncStorage.getItem(CACHE_KEY_TIERS),
      AsyncStorage.getItem(CACHE_KEY_TS),
    ]);
    if (!rawS || !rawT || !rawTs) return null;
    const loadedAt = parseInt(rawTs, 10);
    if (!Number.isFinite(loadedAt)) return null;
    const services = JSON.parse(rawS) as CatalogService[];
    const tiersMap = JSON.parse(rawT) as Record<string, FirestoreServiceTierRow[]>;
    return { services, tiersMap, loadedAt };
  } catch {
    return null;
  }
}

async function writeSnapshotToCache(snapshot: ServicesCatalogSnapshot): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [CACHE_KEY_SERVICES, JSON.stringify(snapshot.services)],
      [CACHE_KEY_TIERS, JSON.stringify(snapshot.tiersMap)],
      [CACHE_KEY_TS, String(snapshot.loadedAt)],
    ]);
  } catch {
    /* ignore */
  }
}

export async function fetchServicesFromFirestore(): Promise<ServicesCatalogSnapshot | null> {
  if (!isFirebaseConfigured()) return null;
  const db = getFirebaseFirestore();
  if (!db) return null;
  try {
    const [servicesSnap, tiersSnap] = await Promise.all([
      getDocs(collection(db, 'services')),
      getDocs(collection(db, 'service_tiers')),
    ]);

    const rawServices: CatalogService[] = [];
    for (const d of servicesSnap.docs) {
      const row = normalizeServiceDoc(d.id, d.data() as Record<string, unknown>);
      if (row) rawServices.push(row);
    }
    rawServices.sort((a, b) => a.sortOrder - b.sortOrder);
    const tiersMap: Record<string, FirestoreServiceTierRow[]> = {};
    for (const d of tiersSnap.docs) {
      const data = d.data() as { tiers?: unknown; serviceId?: string };
      const sid = typeof data.serviceId === 'string' && data.serviceId.trim() ? data.serviceId.trim() : d.id;
      const tiers = parseTiersArray(data.tiers);
      if (tiers.length) tiersMap[sid] = tiers;
    }
    const loadedAt = Date.now();
    const services = attachMinPrices(rawServices, tiersMap);
    return { services, tiersMap, loadedAt };
  } catch (e) {
    console.warn('fetchServicesFromFirestore', e);
    return null;
  }
}

function parseTiersArray(raw: unknown): FirestoreServiceTierRow[] {
  if (!Array.isArray(raw)) return [];
  const out: FirestoreServiceTierRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const tierId = typeof o.tierId === 'string' ? o.tierId.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const priceCents =
      typeof o.priceCents === 'number' && Number.isFinite(o.priceCents) ? Math.round(o.priceCents) : NaN;
    const billingCycle = o.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const sortOrder = typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder) ? o.sortOrder : 0;
    const isActive = o.isActive !== false;
    if (!tierId || !name || !Number.isFinite(priceCents)) continue;
    out.push({
      tierId,
      name,
      priceCents,
      billingCycle,
      isActive,
      sortOrder,
      lastPriceUpdatedAt: o.lastPriceUpdatedAt,
      priceChangeNote:
        typeof o.priceChangeNote === 'string' && o.priceChangeNote.trim() ? o.priceChangeNote.trim() : null,
    });
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder);
  return out;
}

function buildFallbackSnapshot(): ServicesCatalogSnapshot {
  const tiersMap = { ...FALLBACK_TIERS_BY_SERVICE_ID };
  const services = attachMinPrices(FALLBACK_SERVICES, tiersMap);
  return { services, tiersMap, loadedAt: Date.now() };
}

export type LoadCatalogResult = {
  snapshot: ServicesCatalogSnapshot;
  source: 'firestore' | 'cache' | 'fallback';
};

/**
 * Loads catalog: cache (if fresh) → optionally refresh Firestore → fallback static.
 * Background refresh does not block first paint when cache is valid.
 */
export async function loadServicesAndTiers(options?: {
  /** Skip Firestore (e.g. tests). */
  skipRemote?: boolean;
}): Promise<LoadCatalogResult> {
  const cached = await readSnapshotFromCache();
  const now = Date.now();
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    console.log('[ServicesCatalog] source: cache (age:', Math.round((now - cached.loadedAt) / 60000), 'min,', cached.services.length, 'services)');
    if (!options?.skipRemote) {
      void refreshFromFirestoreInBackground();
    }
    return { snapshot: cached, source: 'cache' };
  }

  if (!options?.skipRemote) {
    const remote = await fetchServicesFromFirestore();
    if (remote && remote.services.length > 0) {
      console.log('[ServicesCatalog] source: firestore (', remote.services.length, 'services)');
      await writeSnapshotToCache(remote);
      return { snapshot: remote, source: 'firestore' };
    }
  }

  if (cached) {
    console.log('[ServicesCatalog] source: cache/stale (Firestore unavailable)');
    if (!options?.skipRemote) {
      void refreshFromFirestoreInBackground();
    }
    return { snapshot: cached, source: 'cache' };
  }

  console.log('[ServicesCatalog] source: fallback (no Firestore, no cache)');
  const fb = buildFallbackSnapshot();
  await writeSnapshotToCache(fb);
  return { snapshot: fb, source: 'fallback' };
}

export async function refreshFromFirestoreInBackground(): Promise<void> {
  try {
    const remote = await fetchServicesFromFirestore();
    if (remote && remote.services.length > 0) {
      await writeSnapshotToCache(remote);
    }
  } catch (e) {
    console.warn('refreshFromFirestoreInBackground', e);
  }
}
