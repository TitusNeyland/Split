export type FriendBalanceKind = 'they_owe_overdue' | 'they_owe_pending' | 'settled' | 'you_owe';

export type ProfileFriendBalanceRow =
  | {
      id: string;
      kind: 'they_owe_overdue' | 'they_owe_pending' | 'settled';
      displayName: string;
      initials: string;
      subLine: string;
      subscriptionCountLabel: string;
      amount?: number;
    }
  | {
      id: string;
      kind: 'you_owe';
      counterpartyShortName: string;
      subscriptionCountLabel: string;
      amount: number;
    };

/** Total friends for collapsed summary (e.g. avatar stack + “+3”). Wire from Firestore later. */
export const PROFILE_TOTAL_FRIEND_COUNT = 7;

/** Demo / design-time rows; replace with Firestore-derived data later. */
export const PROFILE_FRIEND_BALANCES: ProfileFriendBalanceRow[] = [
  {
    id: 'sam',
    kind: 'they_owe_overdue',
    displayName: 'Sam M.',
    initials: 'SM',
    subLine: 'Netflix · 3 days overdue',
    subscriptionCountLabel: '2 subscriptions',
    amount: 5.33,
  },
  {
    id: 'alex',
    kind: 'they_owe_pending',
    displayName: 'Alex L.',
    initials: 'AL',
    subLine: 'Spotify Family · due in 7 days',
    subscriptionCountLabel: '3 subscriptions',
    amount: 3.4,
  },
  {
    id: 'taylor',
    kind: 'settled',
    displayName: 'Taylor R.',
    initials: 'TR',
    subLine: 'Xbox Game Pass · all caught up',
    subscriptionCountLabel: '1 subscription',
  },
  {
    id: 'casey',
    kind: 'you_owe',
    counterpartyShortName: 'Casey P.',
    subscriptionCountLabel: 'Dinner split',
    amount: 7.0,
  },
];

export function computeNetBarTotals(rows: ProfileFriendBalanceRow[]): {
  owedToYou: number;
  youOwe: number;
} {
  let owedToYou = 0;
  let youOwe = 0;
  for (const r of rows) {
    if (r.kind === 'they_owe_overdue' || r.kind === 'they_owe_pending') {
      owedToYou += r.amount ?? 0;
    } else if (r.kind === 'you_owe') {
      youOwe += r.amount;
    }
  }
  return { owedToYou, youOwe };
}

/** Avatars in collapsed stack (subset of balances + counterparty on you_owe). */
export function getProfileFriendStackEntries(): { id: string; initials: string }[] {
  return PROFILE_FRIEND_BALANCES.map((r) => {
    if (r.kind === 'you_owe') {
      const parts = r.counterpartyShortName.trim().split(/\s+/).filter(Boolean);
      const ini =
        parts.length >= 2
          ? `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
          : r.counterpartyShortName.slice(0, 2).toUpperCase();
      return { id: r.id, initials: ini || '?' };
    }
    return { id: r.id, initials: r.initials };
  });
}

export function getFriendFilterDisplayName(friendId: string): string {
  const r = PROFILE_FRIEND_BALANCES.find((x) => x.id === friendId);
  if (!r) return friendId;
  if (r.kind === 'you_owe') return r.counterpartyShortName;
  return r.displayName;
}

/** Row for the Friends hub list (avatar, net line, shared subs). */
export type FriendsHubFriendRow = {
  id: string;
  /** When set, Remove also deletes `friendships/{uid_pair}` in Firestore. */
  remoteUid?: string;
  displayName: string;
  initials: string;
  sharedSubsLabel: string;
  balanceMain: string;
  balanceSub: string;
  /** Primary amount color for the main balance line. */
  balanceTone: 'green' | 'red' | 'amber' | 'gray';
};

function toSharedSubsLabel(subscriptionCountLabel: string): string {
  const m = subscriptionCountLabel.match(/^(\d+)\s+/);
  if (m) {
    const n = Number(m[1]);
    return `${n} shared subscription${n === 1 ? '' : 's'}`;
  }
  return subscriptionCountLabel.replace(/\bsubscription\b/i, 'shared subscription');
}

/** Maps demo / design-time balances into Friends hub rows. */
export function getFriendsHubFriendRows(): FriendsHubFriendRow[] {
  return PROFILE_FRIEND_BALANCES.map((row): FriendsHubFriendRow => {
    if (row.kind === 'you_owe') {
      return {
        id: row.id,
        displayName: row.counterpartyShortName.replace(/\.$/, '') || row.counterpartyShortName,
        initials: (() => {
          const parts = row.counterpartyShortName.trim().split(/\s+/).filter(Boolean);
          if (parts.length >= 2) {
            return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
          }
          return row.counterpartyShortName.slice(0, 2).toUpperCase() || '?';
        })(),
        sharedSubsLabel: toSharedSubsLabel(row.subscriptionCountLabel),
        balanceMain: `you owe $${row.amount.toFixed(2)}`,
        balanceSub: 'Tap activity for details',
        balanceTone: 'red',
      };
    }
    if (row.kind === 'they_owe_overdue') {
      return {
        id: row.id,
        displayName: row.displayName,
        initials: row.initials,
        sharedSubsLabel: toSharedSubsLabel(row.subscriptionCountLabel),
        balanceMain: `owes $${(row.amount ?? 0).toFixed(2)}`,
        balanceSub: row.subLine,
        balanceTone: 'red',
      };
    }
    if (row.kind === 'they_owe_pending') {
      return {
        id: row.id,
        displayName: row.displayName,
        initials: row.initials,
        sharedSubsLabel: toSharedSubsLabel(row.subscriptionCountLabel),
        balanceMain: `owes $${(row.amount ?? 0).toFixed(2)}`,
        balanceSub: row.subLine,
        balanceTone: 'green',
      };
    }
    return {
      id: row.id,
      displayName: row.displayName,
      initials: row.initials,
      sharedSubsLabel: toSharedSubsLabel(row.subscriptionCountLabel),
      balanceMain: 'settled',
      balanceSub: 'all clear',
      balanceTone: 'gray',
    };
  });
}
