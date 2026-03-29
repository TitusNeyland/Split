/**
 * Home billing strip: derive upcoming charge days from subscription billing fields.
 */
import { clampDayToMonth, parseBillingDayParam } from '../subscription/billingDayFormat';
import {
  parseFirestoreBillingCycle,
  resolveDotColor,
  subscriptionDisplayName,
} from '../subscription/billingCalendarModel';
import type { MemberSubscriptionDoc } from '../subscription/memberSubscriptionsFirestore';
import {
  isViewerAcceptedActiveMember,
  normalizeSubscriptionStatus,
} from '../subscription/subscriptionToCardModel';
import { subscriptionNextBillingDate } from './homeSubscriptionMath';
import { addLocalDays, dateKey, startOfLocalDay } from './homeWeekCalendar';

export type UpcomingBillingEntry = {
  date: Date;
  subscription: MemberSubscriptionDoc;
};

export type HomeCalendarDayCell = {
  key: string;
  date: Date;
  dayName: string;
  dayNum: number;
  isToday: boolean;
  bills: UpcomingBillingEntry[];
  hasBill: boolean;
};

export type HomeBillWhenKind = 'today' | 'tomorrow' | 'other';

function serviceNameForBrand(sub: Record<string, unknown>): string {
  const sn = typeof sub.serviceName === 'string' ? sub.serviceName.trim() : '';
  if (sn) return sn;
  const sid = typeof sub.serviceId === 'string' ? sub.serviceId.trim() : '';
  return sid || 'Subscription';
}

export function getDotColorForSubscription(sub: MemberSubscriptionDoc): string {
  const stored = typeof sub.iconColor === 'string' ? sub.iconColor : undefined;
  return resolveDotColor(stored, serviceNameForBrand(sub));
}

/** Day 1–31 and month index 0–11 for yearly; month from label when missing. */
function parseBillingDayAndMonth(sub: Record<string, unknown>): {
  day: number;
  monthIndexForYearly: number;
} | null {
  const bdRaw = sub.billingDay;
  let day: number | null = null;
  if (typeof bdRaw === 'number' && bdRaw >= 1 && bdRaw <= 31) {
    day = bdRaw;
  } else if (typeof bdRaw === 'string' && bdRaw.trim()) {
    const n = parseInt(bdRaw.trim(), 10);
    if (n >= 1 && n <= 31) day = n;
  }
  const label = typeof sub.billingDayLabel === 'string' ? sub.billingDayLabel.trim() : '';
  if (day === null && label) {
    const parsed = parseBillingDayParam(label);
    if (parsed) return { day: parsed.day, monthIndexForYearly: parsed.monthIndex };
  }
  if (day === null) return null;

  const bmRaw = sub.billingMonth;
  if (typeof bmRaw === 'number' && bmRaw >= 0 && bmRaw <= 11) {
    return { day, monthIndexForYearly: bmRaw };
  }
  if (label) {
    const parsed = parseBillingDayParam(label);
    if (parsed) return { day, monthIndexForYearly: parsed.monthIndex };
  }
  return { day, monthIndexForYearly: 0 };
}

function pushMonthlyOccurrences(
  dates: UpcomingBillingEntry[],
  sub: MemberSubscriptionDoc,
  today: Date,
  dayOfMonth: number,
  monthsAhead: number
): void {
  for (let monthOffset = 0; monthOffset < monthsAhead; monthOffset++) {
    const anchor = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const dom = clampDayToMonth(year, month, dayOfMonth);
    const billingDate = startOfLocalDay(new Date(year, month, dom));
    if (billingDate.getTime() >= today.getTime()) {
      dates.push({ date: billingDate, subscription: sub });
    }
  }
}

function nextYearlyBillingDate(
  today: Date,
  dayOfMonth: number,
  billingMonthIndex: number
): Date {
  const td = startOfLocalDay(today);
  let year = td.getFullYear();
  let dom = clampDayToMonth(year, billingMonthIndex, dayOfMonth);
  let candidate = startOfLocalDay(new Date(year, billingMonthIndex, dom));
  if (candidate.getTime() < td.getTime()) {
    year += 1;
    dom = clampDayToMonth(year, billingMonthIndex, dayOfMonth);
    candidate = startOfLocalDay(new Date(year, billingMonthIndex, dom));
  }
  return candidate;
}

/**
 * Upcoming billing dates from active subscriptions (billingDay + cycle).
 * Falls back to `subscriptionNextBillingDate` when day cannot be parsed.
 */
export function getUpcomingBillingDates(
  subscriptions: MemberSubscriptionDoc[],
  options?: { monthsMonthly?: number; viewerUid?: string }
): UpcomingBillingEntry[] {
  const today = startOfLocalDay(new Date());
  const monthsMonthly = options?.monthsMonthly ?? 6;
  const viewerUid = options?.viewerUid;
  const subs =
    viewerUid && viewerUid.length > 0
      ? subscriptions.filter((s) => isViewerAcceptedActiveMember(s, viewerUid))
      : subscriptions;
  const dates: UpcomingBillingEntry[] = [];

  for (const sub of subs) {
    if (normalizeSubscriptionStatus(sub.status) !== 'active') continue;

    const cycle = parseFirestoreBillingCycle(sub.billingCycle);
    const parsed = parseBillingDayAndMonth(sub);

    if (!parsed) {
      const d = subscriptionNextBillingDate(sub);
      if (d) dates.push({ date: startOfLocalDay(d), subscription: sub });
      continue;
    }

    const { day, monthIndexForYearly } = parsed;

    if (cycle === 'monthly') {
      pushMonthlyOccurrences(dates, sub, today, day, monthsMonthly);
    } else {
      const billingDate = nextYearlyBillingDate(today, day, monthIndexForYearly);
      dates.push({ date: billingDate, subscription: sub });
    }
  }

  return dates.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Horizontal strip: `daysToShow` days starting today. */
export function buildCalendarDays(
  billingDates: UpcomingBillingEntry[],
  daysToShow: number,
  now: Date = new Date()
): HomeCalendarDayCell[] {
  const today = startOfLocalDay(now);
  const days: HomeCalendarDayCell[] = [];

  for (let i = 0; i < daysToShow; i++) {
    const date = addLocalDays(today, i);
    const bills = billingDates.filter((b) => {
      const bd = startOfLocalDay(b.date);
      return (
        bd.getDate() === date.getDate() &&
        bd.getMonth() === date.getMonth() &&
        bd.getFullYear() === date.getFullYear()
      );
    });

    days.push({
      key: dateKey(date),
      date,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: date.getDate(),
      isToday: i === 0,
      bills,
      hasBill: bills.length > 0,
    });
  }

  return days;
}

export function formatHomeBillWhenLabel(
  billingDate: Date,
  today: Date
): { label: string; kind: HomeBillWhenKind } {
  const b0 = startOfLocalDay(billingDate);
  const t0 = startOfLocalDay(today);
  const diffDays = Math.round((b0.getTime() - t0.getTime()) / 86400000);
  if (diffDays === 0) return { label: 'Today', kind: 'today' };
  if (diffDays === 1) return { label: 'Tomorrow', kind: 'tomorrow' };
  const month = b0.toLocaleDateString('en-US', { month: 'short' });
  return { label: `${month} ${b0.getDate()}`, kind: 'other' };
}

export function formatBillingDetailLine(billingDate: Date): string {
  const month = billingDate.toLocaleDateString('en-US', { month: 'short' });
  return `billing ${month} ${billingDate.getDate()}`;
}

export function subscriptionDisplayLabel(sub: MemberSubscriptionDoc): string {
  const sn = typeof sub.serviceName === 'string' ? sub.serviceName : '';
  const pn = typeof sub.planName === 'string' ? sub.planName : undefined;
  return subscriptionDisplayName(sn, pn);
}
