import type { SubscriptionDetailMember } from './subscriptionDetailTypes';

/** Non-owner members who still owe for the current cycle (warning only). */
export function membersOwingBeforeEndSplit(
  members: SubscriptionDetailMember[],
  currentUid: string
): SubscriptionDetailMember[] {
  return members.filter(
    (m) =>
      m.memberId !== currentUid &&
      !m.invitePending &&
      !m.inviteExpired &&
      (m.cycleStatus === 'pending' || m.cycleStatus === 'overdue')
  );
}

/** e.g. "50% / 50% · members ✓" */
export function formatSettingsPercentsLine(members: SubscriptionDetailMember[]): string {
  if (members.length === 0) return '— · members ✓';
  return `${members.map((m) => `${m.percent}%`).join(' / ')} · members ✓`;
}

/** Restart confirmation sheet: `50% / 50% · unchanged` */
export function formatSplitPercentsUnchanged(members: SubscriptionDetailMember[]): string {
  if (members.length === 0) return '— · unchanged';
  return `${members.map((m) => `${m.percent}%`).join(' / ')} · unchanged`;
}
