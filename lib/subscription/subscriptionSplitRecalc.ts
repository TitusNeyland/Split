/**
 * Keeps owner share aligned with "Option A": while any invitee is still pending acceptance,
 * the owner's obligation is the full subscription total. When all invitees are active, amounts
 * match the planned split stored on `members` roster entries (`fixedAmount` / `percentage`).
 */

export type SubscriptionMemberRosterRow = {
  uid?: string;
  email?: string;
  inviteId?: string;
  memberStatus?: string;
  paymentStatus?: string | null;
  /** True when first share payment applies next billing cycle (see Option A). */
  firstChargeObligationStartsNextCycle?: boolean;
  percentage?: number;
  fixedAmount?: number;
  splitMethod?: string;
};

export function hasInvitePendingInShares(shares: { role?: string; invitePending?: boolean }[]): boolean {
  return shares.some((s) => s && s.role !== 'owner' && Boolean(s.invitePending));
}

export function applyPlannedAmountsFromMemberRoster(
  shares: Record<string, unknown>[],
  roster: SubscriptionMemberRosterRow[]
): Record<string, unknown>[] {
  const byUid = new Map<string, SubscriptionMemberRosterRow>();
  for (const m of roster) {
    const u = typeof m.uid === 'string' && m.uid ? m.uid : '';
    if (u) byUid.set(u, m);
  }
  return shares.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const mid = String((s as { memberId?: string }).memberId ?? '');
    const ro = mid ? byUid.get(mid) : undefined;
    if (!ro || typeof ro.fixedAmount !== 'number' || !Number.isFinite(ro.fixedAmount)) return { ...s };
    const pct =
      typeof ro.percentage === 'number' && Number.isFinite(ro.percentage)
        ? Math.round(ro.percentage * 100) / 100
        : (s as { percent?: number }).percent;
    return {
      ...s,
      amountCents: Math.round(ro.fixedAmount),
      ...(typeof pct === 'number' && Number.isFinite(pct) ? { percent: pct } : {}),
    };
  });
}

export function syncOwnerShareForPendingInvites(
  shares: Record<string, unknown>[],
  totalCents: number,
  roster: SubscriptionMemberRosterRow[] | undefined
): Record<string, unknown>[] {
  const list = shares.map((x) => ({ ...x }));
  const arr = list as { role?: string; invitePending?: boolean }[];
  if (hasInvitePendingInShares(arr)) {
    const oi = list.findIndex((x) => x && (x as { role?: string }).role === 'owner');
    if (oi >= 0) {
      list[oi] = { ...list[oi], amountCents: Math.round(totalCents) };
    }
    return list;
  }
  if (roster && roster.length > 0) {
    return applyPlannedAmountsFromMemberRoster(list, roster);
  }
  return list;
}
