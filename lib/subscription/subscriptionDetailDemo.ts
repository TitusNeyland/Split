import { equalCentsSplit, equalIntegerPercents } from './addSubscriptionSplitMath';

/** Compatible with `SplitEditorMember` in the subscription split editor UI. */
export type SubscriptionDetailEditorMember = {
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
};

export type CyclePaymentStatus = 'paid' | 'pending' | 'overdue';

export type SubscriptionDetailMember = {
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
  percent: number;
  amountCents: number;
  cycleStatus: CyclePaymentStatus;
};

export type SubscriptionHistoryCycle = {
  key: string;
  label: string;
  totalCents: number;
  allPaid: boolean;
  /** Per-member amounts for drill-down (same order as members at billing time). */
  lines: { memberId: string; displayName: string; amountCents: number; paid: boolean }[];
};

export type SubscriptionDetailModel = {
  id: string;
  serviceName: string;
  displayName: string;
  billingCycleLabel: string;
  nextBillingLabel: string;
  totalCents: number;
  isOwner: boolean;
  /** When `isOwner` is false, payer display name (e.g. "Alex L."). */
  payerName?: string;
  autoCharge: 'on' | 'off';
  members: SubscriptionDetailMember[];
  paidMemberCount: number;
  collectedCents: number;
  editorMembers: SubscriptionDetailEditorMember[];
  history: SubscriptionHistoryCycle[];
};

function membersFromEqualSplit(
  base: Omit<SubscriptionDetailEditorMember, 'avatarUrl'>[],
  totalCents: number,
  cycleStatuses: CyclePaymentStatus[],
  avatarUrlFirst?: string | null
): { members: SubscriptionDetailMember[]; editorMembers: SubscriptionDetailEditorMember[] } {
  const n = base.length;
  const percents = equalIntegerPercents(n);
  const cents = equalCentsSplit(totalCents, n);
  const editorMembers: SubscriptionDetailEditorMember[] = base.map((m, i) =>
    i === 0 ? { ...m, avatarUrl: avatarUrlFirst ?? null } : m
  );
  const members: SubscriptionDetailMember[] = base.map((m, i) => ({
    memberId: m.memberId,
    displayName: m.displayName,
    initials: m.initials,
    avatarBg: m.avatarBg,
    avatarColor: m.avatarColor,
    avatarUrl: i === 0 ? avatarUrlFirst : undefined,
    percent: percents[i]!,
    amountCents: cents[i]!,
    cycleStatus: cycleStatuses[i] ?? 'pending',
  }));
  return { members, editorMembers };
}

const TN = {
  memberId: '1',
  displayName: 'Titus (you)',
  initials: 'TN',
  avatarBg: '#EEEDFE',
  avatarColor: '#534AB7',
} as const;
const AL = {
  memberId: '2',
  displayName: 'Alex L.',
  initials: 'AL',
  avatarBg: '#E1F5EE',
  avatarColor: '#0F6E56',
} as const;
const SM = {
  memberId: '3',
  displayName: 'Sam M.',
  initials: 'SM',
  avatarBg: '#FAECE7',
  avatarColor: '#993C1D',
} as const;
const TR = {
  memberId: '4',
  displayName: 'Taylor R.',
  initials: 'TR',
  avatarBg: '#E6F1FB',
  avatarColor: '#185FA5',
} as const;
const KP = {
  memberId: '5',
  displayName: 'Kim P.',
  initials: 'KP',
  avatarBg: '#EAF3DE',
  avatarColor: '#3B6D11',
} as const;

const JD = {
  memberId: 'h1',
  displayName: 'Jordan (you)',
  initials: 'JD',
  avatarBg: '#EEEDFE',
  avatarColor: '#534AB7',
} as const;

function historyLinesFromMembers(
  members: SubscriptionDetailMember[],
  allPaid: boolean
): SubscriptionHistoryCycle['lines'] {
  return members.map((m) => ({
    memberId: m.memberId,
    displayName: m.displayName,
    amountCents: m.amountCents,
    paid: allPaid || m.cycleStatus === 'paid',
  }));
}

export function getDemoSubscriptionDetail(
  id: string,
  userAvatarUrl: string | null
): SubscriptionDetailModel | null {
  const NETFLIX_TOTAL = 2299;
  const netflixBase = [TN, AL, SM];
  const netflixSplit = membersFromEqualSplit(
    [...netflixBase],
    NETFLIX_TOTAL,
    ['paid', 'paid', 'pending'],
    userAvatarUrl
  );
  const netflixMembers = netflixSplit.members;

  const SPOTIFY_TOTAL = 1699;
  const spotifySplit = membersFromEqualSplit(
    [TN, AL, SM, TR, KP],
    SPOTIFY_TOTAL,
    ['paid', 'paid', 'paid', 'paid', 'paid'],
    userAvatarUrl
  );

  const ICLOUD_TOTAL = 999;
  const icloudSplit = membersFromEqualSplit(
    [TN, AL, SM, TR],
    ICLOUD_TOTAL,
    ['pending', 'pending', 'pending', 'pending'],
    userAvatarUrl
  );

  const HULU_TOTAL = 799;
  const huluSplit = membersFromEqualSplit(
    [JD, SM],
    HULU_TOTAL,
    ['paid', 'overdue'],
    userAvatarUrl
  );

  const XBOX_TOTAL = 1499;
  const xboxSplit = membersFromEqualSplit(
    [JD, TR],
    XBOX_TOTAL,
    ['pending', 'pending'],
    userAvatarUrl
  );

  const models: Record<string, SubscriptionDetailModel> = {
    'demo-netflix-premium': {
      id: 'demo-netflix-premium',
      serviceName: 'Netflix Premium',
      displayName: 'Netflix Premium',
      billingCycleLabel: 'Monthly',
      nextBillingLabel: 'Mar 18, 2026',
      totalCents: NETFLIX_TOTAL,
      isOwner: true,
      autoCharge: 'on',
      members: netflixMembers,
      paidMemberCount: 2,
      collectedCents: netflixMembers[0]!.amountCents + netflixMembers[1]!.amountCents,
      editorMembers: netflixSplit.editorMembers,
      history: [
        {
          key: '2026-03',
          label: 'Mar 2026',
          totalCents: NETFLIX_TOTAL,
          allPaid: false,
          lines: historyLinesFromMembers(netflixMembers, false),
        },
        {
          key: '2026-02',
          label: 'Feb 2026',
          totalCents: NETFLIX_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(netflixMembers, true),
        },
        {
          key: '2026-01',
          label: 'Jan 2026',
          totalCents: 1999,
          allPaid: true,
          lines: netflixMembers.map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName,
            amountCents: Math.round(1999 * (m.percent / 100)),
            paid: true,
          })),
        },
        {
          key: '2025-12',
          label: 'Dec 2025',
          totalCents: 1999,
          allPaid: false,
          lines: netflixMembers.map((m, i) => ({
            memberId: m.memberId,
            displayName: m.displayName,
            amountCents: Math.round(1999 * (m.percent / 100)),
            paid: i !== 2,
          })),
        },
      ],
    },
    'demo-spotify-family': {
      id: 'demo-spotify-family',
      serviceName: 'Spotify Family',
      displayName: 'Spotify Family',
      billingCycleLabel: 'Monthly',
      nextBillingLabel: 'Mar 25, 2026',
      totalCents: SPOTIFY_TOTAL,
      isOwner: false,
      payerName: 'Alex L.',
      autoCharge: 'on',
      members: spotifySplit.members,
      paidMemberCount: 5,
      collectedCents: SPOTIFY_TOTAL,
      editorMembers: spotifySplit.editorMembers,
      history: [
        {
          key: '2026-03',
          label: 'Mar 2026',
          totalCents: SPOTIFY_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(spotifySplit.members, true),
        },
        {
          key: '2026-02',
          label: 'Feb 2026',
          totalCents: SPOTIFY_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(spotifySplit.members, true),
        },
        {
          key: '2026-01',
          label: 'Jan 2026',
          totalCents: SPOTIFY_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(spotifySplit.members, true),
        },
      ],
    },
    'demo-icloud-2tb': {
      id: 'demo-icloud-2tb',
      serviceName: 'iCloud 2TB',
      displayName: 'iCloud 2TB',
      billingCycleLabel: 'Monthly',
      nextBillingLabel: 'Apr 3, 2026',
      totalCents: ICLOUD_TOTAL,
      isOwner: false,
      payerName: 'Taylor R.',
      autoCharge: 'off',
      members: icloudSplit.members,
      paidMemberCount: 0,
      collectedCents: 0,
      editorMembers: icloudSplit.editorMembers,
      history: [
        {
          key: '2026-03',
          label: 'Mar 2026',
          totalCents: ICLOUD_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(icloudSplit.members, true),
        },
        {
          key: '2026-02',
          label: 'Feb 2026',
          totalCents: ICLOUD_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(icloudSplit.members, true),
        },
        {
          key: '2026-01',
          label: 'Jan 2026',
          totalCents: ICLOUD_TOTAL,
          allPaid: false,
          lines: icloudSplit.members.map((m, i) => ({
            memberId: m.memberId,
            displayName: m.displayName,
            amountCents: m.amountCents,
            paid: i !== 2,
          })),
        },
      ],
    },
    'demo-hulu-overdue': {
      id: 'demo-hulu-overdue',
      serviceName: 'Hulu',
      displayName: 'Hulu',
      billingCycleLabel: 'Monthly',
      nextBillingLabel: 'Apr 12, 2026',
      totalCents: HULU_TOTAL,
      isOwner: true,
      autoCharge: 'on',
      members: huluSplit.members,
      paidMemberCount: 1,
      collectedCents: huluSplit.members[0]!.amountCents,
      editorMembers: huluSplit.editorMembers,
      history: [
        {
          key: '2026-02',
          label: 'Feb 2026',
          totalCents: HULU_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(huluSplit.members, true),
        },
      ],
    },
    'demo-xbox-paused': {
      id: 'demo-xbox-paused',
      serviceName: 'Xbox Game Pass',
      displayName: 'Xbox Game Pass',
      billingCycleLabel: 'Monthly',
      nextBillingLabel: 'Paused — next cycle TBD',
      totalCents: XBOX_TOTAL,
      isOwner: false,
      payerName: 'Taylor R.',
      autoCharge: 'off',
      members: xboxSplit.members,
      paidMemberCount: 0,
      collectedCents: 0,
      editorMembers: xboxSplit.editorMembers,
      history: [
        {
          key: '2026-02',
          label: 'Feb 2026',
          totalCents: XBOX_TOTAL,
          allPaid: true,
          lines: historyLinesFromMembers(xboxSplit.members, true),
        },
      ],
    },
  };

  return models[id] ?? null;
}
