import {
  computeFriendBalances,
  countSharedSubscriptionsWithFriend,
} from '../home/homeSubscriptionMath';
import type { MemberSubscriptionDoc } from '../subscription/memberSubscriptionsFirestore';
import { initialsFromName } from './profile';
import { formatUsdDollarsFixed2 } from '../format/currency';

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

/**
 * Profile card expanded rows + net bar from live subscriptions and friendships
 * (same `computeFriendBalances` ordering as home / friends hub).
 */
export function buildProfileFriendBalanceRowsFromSubscriptions(
  viewerUid: string,
  subscriptions: MemberSubscriptionDoc[],
  friendUids: string[],
  displayNameByUid: Record<string, string>
): ProfileFriendBalanceRow[] {
  if (!viewerUid || friendUids.length === 0) return [];

  const balances = computeFriendBalances(subscriptions, viewerUid, friendUids);

  return balances.map((b) => {
    const name = displayNameByUid[b.friendUid]?.trim() || 'Friend';
    const initials = initialsFromName(name);
    const sharedN = countSharedSubscriptionsWithFriend(subscriptions, viewerUid, b.friendUid);
    const subscriptionCountLabel = `${sharedN} subscription${sharedN === 1 ? '' : 's'}`;

    const they = b.theyOweMeCents / 100;
    const owe = b.iOweThemCents / 100;

    if (b.sortKey === 2) {
      return {
        id: b.friendUid,
        kind: 'you_owe',
        counterpartyShortName: name,
        subscriptionCountLabel,
        amount: owe,
      };
    }
    if (b.sortKey === 0) {
      return {
        id: b.friendUid,
        kind: 'they_owe_overdue',
        displayName: name,
        initials,
        subLine: 'Payment overdue',
        subscriptionCountLabel,
        amount: they,
      };
    }
    if (b.sortKey === 1) {
      return {
        id: b.friendUid,
        kind: 'they_owe_pending',
        displayName: name,
        initials,
        subLine: 'Payment pending',
        subscriptionCountLabel,
        amount: they,
      };
    }
    return {
      id: b.friendUid,
      kind: 'settled',
      displayName: name,
      initials,
      subLine: 'all clear',
      subscriptionCountLabel,
    };
  });
}

/** Avatars in collapsed stack (subset of balances + counterparty on you_owe). */
export function getStackEntriesFromProfileRows(
  rows: ProfileFriendBalanceRow[]
): { id: string; initials: string }[] {
  return rows.map((r) => {
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

/** Display name for Activity friend filter (from `users/{uid}` via friend directory). */
export function getFriendFilterDisplayName(
  friendId: string,
  displayNameByUid: Record<string, string>
): string {
  const n = displayNameByUid[friendId]?.trim();
  if (n) return n;
  return 'Friend';
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

/**
 * Friends hub list rows from live subscriptions + friendships + display names.
 * `displayNameByUid` should include an entry per friend (fallback 'Friend').
 */
export function buildFriendsHubFriendRowsFromSubscriptions(
  viewerUid: string,
  subscriptions: MemberSubscriptionDoc[],
  friendUids: string[],
  displayNameByUid: Record<string, string>
): FriendsHubFriendRow[] {
  if (!viewerUid || friendUids.length === 0) return [];

  const balances = computeFriendBalances(subscriptions, viewerUid, friendUids);

  return balances.map((b) => {
    const name = displayNameByUid[b.friendUid]?.trim() || 'Friend';
    const initials = initialsFromName(name);
    const sharedN = countSharedSubscriptionsWithFriend(subscriptions, viewerUid, b.friendUid);
    const sharedSubsLabel = `${sharedN} shared subscription${sharedN === 1 ? '' : 's'}`;

    const they = b.theyOweMeCents / 100;
    const owe = b.iOweThemCents / 100;

    if (b.sortKey === 2) {
      return {
        id: b.friendUid,
        remoteUid: b.friendUid,
        displayName: name,
        initials,
        sharedSubsLabel,
        balanceMain: `you owe ${formatUsdDollarsFixed2(owe)}`,
        balanceSub: 'Tap activity for details',
        balanceTone: 'red',
      };
    }
    if (b.sortKey === 0) {
      return {
        id: b.friendUid,
        remoteUid: b.friendUid,
        displayName: name,
        initials,
        sharedSubsLabel,
        balanceMain: `owes ${formatUsdDollarsFixed2(they)}`,
        balanceSub: 'Payment overdue',
        balanceTone: 'red',
      };
    }
    if (b.sortKey === 1) {
      return {
        id: b.friendUid,
        remoteUid: b.friendUid,
        displayName: name,
        initials,
        sharedSubsLabel,
        balanceMain: `owes ${formatUsdDollarsFixed2(they)}`,
        balanceSub: 'Payment pending',
        balanceTone: 'green',
      };
    }
    return {
      id: b.friendUid,
      remoteUid: b.friendUid,
      displayName: name,
      initials,
      sharedSubsLabel,
      balanceMain: 'settled',
      balanceSub: 'all clear',
      balanceTone: 'gray',
    };
  });
}

