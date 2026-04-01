/**
 * Home "This week" billing strip + next-bill preview helpers.
 */

import { formatUsdDollarsFixed2 } from '../format/currency';

export type HomeCalendarBill = {
  id: string;
  serviceName: string;
  /** Calendar day of the charge (local midnight). */
  billingDate: Date;
  /** Total subscription cost in dollars. */
  amount: number;
};

export type HomeCalendarStripDay = {
  key: string;
  dow: string;
  num: number;
  date: Date;
  isToday: boolean;
  hasBill: boolean;
};

export type HomeBillPreviewModel = {
  serviceName: string;
  /** e.g. "billing Mar 22" — shown smaller next to the service name on Home. */
  billingDetail: string;
  whenLabel: string;
  whenIsToday: boolean;
  amountFormatted: string;
};

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return startOfLocalDay(x);
}

/** Monday-start week containing `anchor`. */
export function startOfWeekMonday(anchor: Date): Date {
  const d = startOfLocalDay(anchor);
  const dow = d.getDay();
  const fromMon = dow === 0 ? -6 : 1 - dow;
  return addLocalDays(d, fromMon);
}

export function formatBillingDetail(d: Date): string {
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `billing ${month} ${d.getDate()}`;
}

export function formatUpcomingWhenLabel(billingDate: Date, today: Date): string {
  const b0 = startOfLocalDay(billingDate);
  const t0 = startOfLocalDay(today);
  if (b0.getTime() === t0.getTime()) return 'Today';
  const wk = b0.toLocaleDateString('en-US', { weekday: 'short' });
  return `${wk} ${b0.getDate()}`;
}

export function buildCalendarStripDays(
  now: Date,
  bills: HomeCalendarBill[],
  numDays: number
): HomeCalendarStripDay[] {
  const today = startOfLocalDay(now);
  const start = startOfWeekMonday(now);
  const billKeys = new Set(
    bills.map((b) => dateKey(startOfLocalDay(b.billingDate)))
  );

  const days: HomeCalendarStripDay[] = [];
  for (let i = 0; i < numDays; i++) {
    const cell = addLocalDays(start, i);
    const key = dateKey(cell);
    days.push({
      key,
      dow: cell.toLocaleDateString('en-US', { weekday: 'short' }),
      num: cell.getDate(),
      date: cell,
      isToday: cell.getTime() === today.getTime(),
      hasBill: billKeys.has(key),
    });
  }
  return days;
}

const PREVIEW_HORIZON_DAYS = 14;

/**
 * Earliest billing day within [today, today+14]; ties on same day → highest amount.
 */
export function pickNextBillPreview(
  bills: HomeCalendarBill[],
  now: Date = new Date()
): HomeBillPreviewModel | null {
  if (bills.length === 0) return null;
  const t0 = startOfLocalDay(now);
  const end = addLocalDays(t0, PREVIEW_HORIZON_DAYS);

  const inWindow = bills.filter((b) => {
    const bd = startOfLocalDay(b.billingDate);
    return bd.getTime() >= t0.getTime() && bd.getTime() <= end.getTime();
  });
  if (inWindow.length === 0) return null;

  const bestByDay = new Map<string, HomeCalendarBill>();
  for (const b of inWindow) {
    const k = dateKey(startOfLocalDay(b.billingDate));
    const prev = bestByDay.get(k);
    if (!prev || b.amount > prev.amount) bestByDay.set(k, b);
  }

  let chosen: HomeCalendarBill | null = null;
  for (const b of bestByDay.values()) {
    if (!chosen) {
      chosen = b;
      continue;
    }
    const cb = startOfLocalDay(chosen.billingDate);
    const bb = startOfLocalDay(b.billingDate);
    if (bb.getTime() < cb.getTime()) chosen = b;
  }
  if (!chosen) return null;

  const bd = startOfLocalDay(chosen.billingDate);
  const whenIsToday = bd.getTime() === t0.getTime();

  return {
    serviceName: chosen.serviceName,
    billingDetail: formatBillingDetail(bd),
    whenLabel: formatUpcomingWhenLabel(bd, now),
    whenIsToday,
    amountFormatted: formatUsdDollarsFixed2(chosen.amount),
  };
}
