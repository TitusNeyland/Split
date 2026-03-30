/** Shared UI model types for subscription detail + split editor (Firestore-backed). */

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
  invitePending?: boolean;
  inviteExpired?: boolean;
  inviteId?: string;
  pendingInviteEmail?: string | null;
  rosterEmail?: string | null;
  inviteExpiresAtMs?: number | null;
};

export type SubscriptionHistoryCycle = {
  key: string;
  label: string;
  totalCents: number;
  allPaid: boolean;
  lines: { memberId: string; displayName: string; amountCents: number; paid: boolean }[];
};

export type SplitInviteDeclineNotice = {
  declinerName: string;
  declinerUid?: string;
  inviteId?: string;
};

export type OwnerMemberLeftBanner = {
  leaverDisplayName: string;
  shareCents: number;
};

export type SubscriptionDetailModel = {
  id: string;
  serviceName: string;
  /** Catalog preset id when stored on the subscription (matches `services/{id}`). */
  serviceId?: string;
  displayName: string;
  billingCycleLabel: string;
  nextBillingLabel: string;
  totalCents: number;
  isOwner: boolean;
  payerName?: string;
  autoCharge: 'on' | 'off';
  lifecycleStatus?: 'active' | 'ended';
  /** Formatted from `endedAt` when status is ended (e.g. "Mar 29, 2026"). */
  endedOnLabel?: string;
  /** Owner: show after a member voluntarily leaves. */
  ownerMemberLeftBanner?: OwnerMemberLeftBanner | null;
  /** Owner: custom/fixed split no longer sums to 100% after a member left. */
  customSplitNeedsRebalance?: boolean;
  members: SubscriptionDetailMember[];
  paidMemberCount: number;
  collectedCents: number;
  activeMembersTotalCents: number;
  editorMembers: SubscriptionDetailEditorMember[];
  history: SubscriptionHistoryCycle[];
  splitInviteDeclineNotices?: SplitInviteDeclineNotice[];
};
