import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SUBSCRIPTION_SORT_ID,
  isSubscriptionSortId,
  SORT_STORAGE_KEY,
  type SubscriptionSortId,
} from '../lib/subscription/subscriptionSort';

export async function loadSortPreference(): Promise<SubscriptionSortId> {
  try {
    const saved = await AsyncStorage.getItem(SORT_STORAGE_KEY);
    return isSubscriptionSortId(saved) ? saved : DEFAULT_SUBSCRIPTION_SORT_ID;
  } catch {
    return DEFAULT_SUBSCRIPTION_SORT_ID;
  }
}

export async function saveSortPreference(sortId: SubscriptionSortId): Promise<void> {
  await AsyncStorage.setItem(SORT_STORAGE_KEY, sortId);
}

export function useSubscriptionSortPreference(): {
  sortId: SubscriptionSortId;
  setSortId: (id: SubscriptionSortId) => void;
  ready: boolean;
} {
  const [sortId, setSortIdState] = useState<SubscriptionSortId>(DEFAULT_SUBSCRIPTION_SORT_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSortPreference().then((id) => {
      if (!cancelled) {
        setSortIdState(id);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSortId = useCallback((id: SubscriptionSortId) => {
    setSortIdState(id);
    void saveSortPreference(id);
  }, []);

  return { sortId, setSortId, ready };
}
