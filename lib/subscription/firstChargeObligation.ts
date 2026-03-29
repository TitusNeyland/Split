import { parseBillingDayParam } from './billingDayFormat';

/**
 * Option A: if this month's billing day is still strictly in the future, the new member's first
 * obligation is the current cycle; if it has already passed (or is today), obligation starts next cycle.
 */
export function computeFirstChargeObligationStartsNextCycle(data: {
  billingDayLabel?: unknown;
}): boolean {
  const label = typeof data.billingDayLabel === 'string' ? data.billingDayLabel : '';
  const parsed = parseBillingDayParam(label.trim());
  const day = parsed?.day ?? 1;
  const today = new Date();
  const billingDate = new Date(today.getFullYear(), today.getMonth(), day);
  const firstCycleIsThisMonth = billingDate > today;
  return !firstCycleIsThisMonth;
}
