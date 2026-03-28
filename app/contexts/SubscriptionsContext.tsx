import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import {
  subscribeMemberSubscriptions,
  type MemberSubscriptionDoc,
} from '../../lib/subscription/memberSubscriptionsFirestore';

type SubscriptionsContextValue = {
  subscriptions: MemberSubscriptionDoc[];
  loading: boolean;
};

const SubscriptionsContext = createContext<SubscriptionsContextValue>({
  subscriptions: [],
  loading: true,
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

  const value = useMemo(
    () => ({ subscriptions, loading }),
    [subscriptions, loading]
  );

  return <SubscriptionsContext.Provider value={value}>{children}</SubscriptionsContext.Provider>;
}

export function useSubscriptions(): SubscriptionsContextValue {
  return useContext(SubscriptionsContext);
}
