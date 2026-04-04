/** Shared billing UI helpers used by subscription cards and calendar (no dependency on card math). */

export type BillingMemberStatus = 'paid' | 'pending' | 'overdue' | 'owner' | 'invited_pending' | string;

export function parseFirestoreBillingCycle(raw: unknown): 'monthly' | 'yearly' {
  return raw === 'yearly' ? 'yearly' : 'monthly';
}

export function subscriptionDisplayName(serviceName: string, planName?: string): string {
  const s = serviceName.trim();
  const p = planName?.trim() ?? '';
  if (p && s && !s.toLowerCase().includes(p.toLowerCase())) return `${s} ${p}`.trim();
  return s || p || 'Subscription';
}

/** Invitees whose `memberStatus` is still `pending` (not yet accepted). */
export function countPendingMemberAcceptances(data: Record<string, unknown>): number {
  const roster = data.members;
  if (!Array.isArray(roster)) return 0;
  let n = 0;
  for (const m of roster) {
    if (m && typeof m === 'object' && (m as { memberStatus?: string }).memberStatus === 'pending') n++;
  }
  return n;
}

export function buildStatusBadge(
  statusMap: Record<string, BillingMemberStatus> | undefined,
  viewerUid: string,
  options?: { pendingAcceptanceCount?: number }
): { label: string; textColor: string; backgroundColor?: string } {
  const C = {
    green: '#0F6E56',
    orange: '#854F0B',
    red: '#A32D2D',
    muted: '#5F5E5A',
  };

  const pendingAccept = options?.pendingAcceptanceCount ?? 0;
  if (pendingAccept > 0) {
    return {
      label: `${pendingAccept} pending`,
      textColor: C.orange,
      backgroundColor: '#FAEEDA',
    };
  }

  if (!statusMap || Object.keys(statusMap).length === 0) {
    return { label: '—', textColor: C.muted };
  }

  const viewerRaw = String(statusMap[viewerUid] ?? '').toLowerCase();
  if (viewerRaw === 'overdue') {
    return { label: 'Overdue', textColor: C.red };
  }

  let overdue = 0;
  let pending = 0;
  for (const [, raw] of Object.entries(statusMap)) {
    const st = String(raw).toLowerCase();
    if (st === 'owner' || st === 'paid') continue;
    if (st === 'overdue') overdue++;
    else if (st === 'pending' || st === 'invited_pending') pending++;
  }

  if (overdue > 0) return { label: `${overdue} overdue`, textColor: C.red };
  if (pending > 0) return { label: `${pending} pending`, textColor: C.orange };
  return { label: 'All paid', textColor: C.green };
}
