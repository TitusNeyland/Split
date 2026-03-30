/** Firestore `services/{serviceId}` + client catalog model. */

export type ServiceCategoryId =
  | 'streaming'
  | 'music'
  | 'gaming'
  | 'ai'
  | 'cloud'
  | 'shopping'
  | 'apps'
  | 'fitness';

/** One row inside `service_tiers/{serviceId}.tiers[]`. */
export type FirestoreServiceTierRow = {
  tierId: string;
  name: string;
  priceCents: number;
  billingCycle: 'monthly' | 'yearly';
  isActive: boolean;
  sortOrder: number;
  lastPriceUpdatedAt?: unknown;
  priceChangeNote?: string | null;
};

/** Normalized service for picker + ServiceIcon (from Firestore or fallback). */
export type CatalogService = {
  id: string;
  serviceId: string;
  name: string;
  category: ServiceCategoryId;
  brandColor: string;
  iconType: string;
  isActive: boolean;
  sortOrder: number;
  /** Lowest tier price in cents (for “from $X” on picker). */
  priceCentsMin: number;
};

export type ServicesCatalogSnapshot = {
  services: CatalogService[];
  tiersMap: Record<string, FirestoreServiceTierRow[]>;
  loadedAt: number;
};
