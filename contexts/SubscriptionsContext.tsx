import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import {
  subscribeMemberSubscriptions,
  type MemberSubscriptionDoc,
} from '../lib/subscription/memberSubscriptionsFirestore';
import {
  computeCollectedThisMonthCents,
  computeMonthlyTotalCents,
  computeMyShareCents,
  computeNetBalanceCents,
  computeOverdueOwedToOwnerCents,
  computeOwedToYouCents,
  computeSavedBySplittingCents,
  computeSavedThisMonthCents,
  computeYouOweCents,
} from '../lib/subscription/subscriptionDerivedMetrics';

type SubscriptionsContextValue = {
  subscriptions: MemberSubscriptionDoc[];
  loading: boolean;
  /** Active splits in context (same as activeMemberUids query + accepted-only merge). */
  activeCount: number;
  monthlyTotalCents: number;
  myShareCents: number;
  youOweCents: number;
  owedToYouCents: number;
  overdueCents: number;
  netBalanceCents: number;
  savedBySplittingCents: number;
  savedThisMonthCents: number;
  collectedThisMonthCents: number;
};

const SubscriptionsContext = createContext<SubscriptionsContextValue>({
  subscriptions: [],
  loading: true,
  activeCount: 0,
  monthlyTotalCents: 0,
  myShareCents: 0,
  youOweCents: 0,
  owedToYouCents: 0,
  overdueCents: 0,
  netBalanceCents: 0,
  savedBySplittingCents: 0,
  savedThisMonthCents: 0,
  collectedThisMonthCents: 0,
});

export function SubscriptionsProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [subscriptions, setSubscriptions] = useState<MemberSubscriptionDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeMemberSubscriptions(uid, (subs, subsLoading) => {
      setSubscriptions(subs);
      setLoading(subsLoading);
    });
  }, [user?.uid]);

  const uid = user?.uid ?? '';

  const derived = useMemo(() => {
    const activeCount = subscriptions.length;
    const monthlyTotalCents = computeMonthlyTotalCents(subscriptions);
    const myShareCents = computeMyShareCents(subscriptions, uid);
    const youOweCents = computeYouOweCents(subscriptions, uid);
    const owedToYouCents = computeOwedToYouCents(subscriptions, uid);
    const overdueCents = computeOverdueOwedToOwnerCents(subscriptions, uid);
    const netBalanceCents = computeNetBalanceCents(subscriptions, uid);
    const savedBySplittingCents = computeSavedBySplittingCents(subscriptions, uid);
    const savedThisMonthCents = computeSavedThisMonthCents(subscriptions, uid);
    const collectedThisMonthCents = computeCollectedThisMonthCents(subscriptions, uid);
    return {
      activeCount,
      monthlyTotalCents,
      myShareCents,
      youOweCents,
      owedToYouCents,
      overdueCents,
      netBalanceCents,
      savedBySplittingCents,
      savedThisMonthCents,
      collectedThisMonthCents,
    };
  }, [subscriptions, uid]);

  const value = useMemo(
    () => ({
      subscriptions,
      loading,
      ...derived,
    }),
    [subscriptions, loading, derived]
  );

  return <SubscriptionsContext.Provider value={value}>{children}</SubscriptionsContext.Provider>;
}

export function useSubscriptions(): SubscriptionsContextValue {
  return useContext(SubscriptionsContext);
}
