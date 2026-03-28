import { parseFirestoreBillingCycle, subscriptionDisplayName } from './billingCalendarModel';
import { formatFirstChargeDateLong, getNextFirstChargeDate, ordinalDay } from './billingDayFormat';

function effectiveBillingDayLabel(data: Record<string, unknown>): string {
  const existing = data.billingDayLabel;
  if (typeof existing === 'string' && existing.trim()) return existing.trim();
  const bd = data.billingDay;
  if (typeof bd === 'number' && bd >= 1 && bd <= 31) {
    return `Every ${ordinalDay(bd)}`;
  }
  return '';
}

type ShareRow = { memberId?: string; percent?: number; invitePending?: boolean };

/**
 * Builds Restart split sheet copy from a `subscriptions/{id}` document (e.g. list card).
 */
export function buildRestartSheetModelFromMemberDoc(doc: Record<string, unknown>): {
  subscriptionName: string;
  firstNewBillLabel: string;
  splitUnchangedLine: string;
  membersNotifiedCount: number;
} | null {
  const shares = doc.splitMemberShares;
  if (!Array.isArray(shares) || shares.length === 0) return null;
  const rows = shares as ShareRow[];
  const name = subscriptionDisplayName(
    typeof doc.serviceName === 'string' ? doc.serviceName : '',
    typeof doc.planName === 'string' ? doc.planName : undefined
  );
  const percParts = rows
    .filter((r) => !r.invitePending)
    .map((r) => `${Math.round(r.percent ?? 0)}%`);
  const splitUnchangedLine =
    percParts.length > 0 ? `${percParts.join(' / ')} · unchanged` : '— · unchanged';
  const cycle = parseFirestoreBillingCycle(doc.billingCycle);
  const label = effectiveBillingDayLabel(doc);
  const next = label ? getNextFirstChargeDate(cycle, label) : null;
  const firstNewBillLabel = next ? formatFirstChargeDateLong(next) : '—';
  const membersNotifiedCount = rows.filter((r) => !r.invitePending).length;
  return {
    subscriptionName: name,
    firstNewBillLabel,
    splitUnchangedLine,
    membersNotifiedCount,
  };
}
