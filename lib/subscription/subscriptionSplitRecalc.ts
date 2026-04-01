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
  leftAt?: unknown;
  paymentStatus?: string | null;
  /** True when first share payment applies next billing cycle (see Option A). */
  firstChargeObligationStartsNextCycle?: boolean;
  percentage?: number;
  fixedAmount?: number;
  splitMethod?: string;
};

/**
 * True when any non-owner row is still an unfilled invite slot (pending acceptance or expired).
 * Owner continues to cover full cost (Option A) until all such slots are resolved or removed.
 */
export function hasInvitePendingInShares(shares: {
  role?: string;
  invitePending?: boolean;
  inviteExpired?: boolean;
}[]): boolean {
  return shares.some(
    (s) => s && s.role !== 'owner' && (Boolean(s.invitePending) || Boolean(s.inviteExpired))
  );
}

/**
 * After the last invitee is removed (declined / owner removed slot), only the owner may remain
 * active. Their roster row still carries the old per-person `fixedAmount` (e.g. $7 of $14); bump
 * to full `totalCents` and 100% so shares and UI match a solo subscription.
 * Skips `owner_less` (owner’s planned share is $0 by design).
 */
export function normalizeSoloOwnerMemberRoster(
  roster: SubscriptionMemberRosterRow[],
  totalCents: number,
  ownerUid: string
): SubscriptionMemberRosterRow[] {
  if (!ownerUid || totalCents <= 0) return roster;
  const active = roster.filter(
    (m) => m && String(m.memberStatus ?? '').toLowerCase() === 'active'
  );
  if (active.length !== 1) return roster;
  const sole = active[0]!;
  if (String(sole.uid ?? '') !== ownerUid) return roster;
  const sm = String(sole.splitMethod ?? 'equal').toLowerCase();
  if (sm === 'owner_less') return roster;

  return roster.map((m) => {
    if (!m || String(m.uid ?? '') !== ownerUid) return m;
    if (String(m.memberStatus ?? '').toLowerCase() !== 'active') return m;
    return {
      ...m,
      fixedAmount: Math.round(totalCents),
      percentage: 100,
    };
  });
}

function deriveOwnerUidFromShares(shares: Record<string, unknown>[]): string {
  const row = shares.find((s) => s && (s as { role?: string }).role === 'owner');
  const mid =
    row && typeof row === 'object' ? (row as { memberId?: string }).memberId : undefined;
  return typeof mid === 'string' && mid ? mid : '';
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
  const arr = list as { role?: string; invitePending?: boolean; inviteExpired?: boolean }[];
  if (hasInvitePendingInShares(arr)) {
    const oi = list.findIndex((x) => x && (x as { role?: string }).role === 'owner');
    if (oi >= 0) {
      list[oi] = { ...list[oi], amountCents: Math.round(totalCents) };
    }
    return list;
  }
  if (roster && roster.length > 0) {
    const ownerUid = deriveOwnerUidFromShares(list);
    const rosterForApply =
      ownerUid && totalCents > 0
        ? normalizeSoloOwnerMemberRoster(
            roster.map((r) => ({ ...r })),
            totalCents,
            ownerUid
          )
        : roster;
    return applyPlannedAmountsFromMemberRoster(list, rosterForApply);
  }
  return list;
}
