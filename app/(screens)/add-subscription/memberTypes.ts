/** Shared types for add-subscription member picker and split wizard (members screen). */

export type WizardMember = {
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  /** From friend search / profile; owner row uses live profile URL in UI. */
  avatarUrl?: string | null;
  isOwner: boolean;
  /** Not on the app yet — slot reserved until they join and add payment. */
  invitePending?: boolean;
  /** Set when the invite was created from an email-shaped search query. */
  pendingInviteEmail?: string;
};

export type SheetFriend = Omit<WizardMember, 'isOwner' | 'invitePending'> & {
  mutualSubscriptionsCount: number;
  avatarUrl?: string | null;
};
