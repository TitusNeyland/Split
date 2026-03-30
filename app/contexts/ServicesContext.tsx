import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CatalogService, FirestoreServiceTierRow } from '../../lib/subscription/servicesCatalogTypes';
import {
  loadServicesAndTiers,
  refreshFromFirestoreInBackground,
} from '../../lib/subscription/servicesCatalogLoader';

type ServicesContextValue = {
  services: CatalogService[];
  tiersMap: Record<string, FirestoreServiceTierRow[]>;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const ServicesContext = createContext<ServicesContextValue | null>(null);

export function ServicesProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [tiersMap, setTiersMap] = useState<Record<string, FirestoreServiceTierRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { snapshot } = await loadServicesAndTiers();
      setServices(snapshot.services);
      setTiersMap(snapshot.tiersMap);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { snapshot } = await loadServicesAndTiers();
        if (cancelled) return;
        setServices(snapshot.services);
        setTiersMap(snapshot.tiersMap);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      services,
      tiersMap,
      loading,
      error,
      refresh,
    }),
    [services, tiersMap, loading, error, refresh]
  );

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): ServicesContextValue {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error('useServices must be used within ServicesProvider');
  }
  return ctx;
}

/** Safe for components that may render outside the provider (e.g. Storybook). */
export function useServicesOptional(): ServicesContextValue | null {
  return useContext(ServicesContext);
}

export { refreshFromFirestoreInBackground };
