import { clampDayToMonth, parseBillingDayParam } from './billingDayFormat';
import { getServiceIconDotColor } from './serviceIconResolve';
import { fmtCents } from './addSubscriptionSplitMath';

export type BillingMemberStatus = 'paid' | 'pending' | 'overdue' | 'owner' | 'invited_pending' | string;

export type BillingCalendarSubscription = {
  id: string;
  displayName: string;
  serviceNameForIcon: string;
  billingCycle: 'monthly' | 'yearly';
  billingDayLabel: string;
  totalCents: number;
  yourShareCents: number;
  dotColor: string;
  statusBadge: { label: string; textColor: string; backgroundColor?: string };
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function billingDateInMonth(
  year: number,
  monthIndex: number,
  cycle: 'monthly' | 'yearly',
  day: number,
  yearlyMonthIndex: number
): Date | null {
  if (cycle === 'yearly' && monthIndex !== yearlyMonthIndex) return null;
  const dom = clampDayToMonth(year, monthIndex, day);
  return new Date(year, monthIndex, dom);
}

export function subscriptionBillsOnDate(
  sub: BillingCalendarSubscription,
  year: number,
  monthIndex: number,
  parsed: { day: number; monthIndex: number },
  cycle: 'monthly' | 'yearly'
): Date | null {
  return billingDateInMonth(year, monthIndex, cycle, parsed.day, parsed.monthIndex);
}

export function parseFirestoreBillingCycle(raw: unknown): 'monthly' | 'yearly' {
  return raw === 'yearly' ? 'yearly' : 'monthly';
}

export function resolveDotColor(storedIconColor: string | undefined, serviceName: string): string {
  const t = storedIconColor?.trim() ?? '';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t;
  return getServiceIconDotColor(serviceName);
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

export function mapFirestoreDocToCalendarSubscription(
  id: string,
  data: Record<string, unknown>,
  viewerUid: string
): BillingCalendarSubscription | null {
  const status = String(data.status ?? 'active').toLowerCase();
  if (status !== 'active') return null;

  const serviceName = typeof data.serviceName === 'string' ? data.serviceName : '';
  const planName = typeof data.planName === 'string' ? data.planName : undefined;
  const billingDayLabel = typeof data.billingDayLabel === 'string' ? data.billingDayLabel : '';
  if (!billingDayLabel.trim()) return null;

  const parsed = parseBillingDayParam(billingDayLabel);
  if (!parsed) return null;

  const billingCycle = parseFirestoreBillingCycle(data.billingCycle);
  const totalCents = typeof data.totalCents === 'number' && Number.isFinite(data.totalCents) ? data.totalCents : 0;

  const shares = Array.isArray(data.splitMemberShares) ? data.splitMemberShares : [];
  const row = shares.find(
    (x) => x && typeof x === 'object' && String((x as { memberId?: string }).memberId) === viewerUid
  ) as { amountCents?: number; role?: string } | undefined;
  let yourShareCents =
    row && typeof row.amountCents === 'number' && Number.isFinite(row.amountCents) ? row.amountCents : 0;

  const ownerUid =
    typeof data.ownerUid === 'string'
      ? data.ownerUid
      : typeof data.ownerId === 'string'
        ? data.ownerId
        : '';
  const hasInvitePending = shares.some(
    (x) =>
      x &&
      typeof x === 'object' &&
      (x as { role?: string }).role !== 'owner' &&
      Boolean((x as { invitePending?: boolean }).invitePending)
  );
  if (viewerUid && ownerUid === viewerUid && hasInvitePending) {
    yourShareCents = totalCents;
  }

  const memberPaymentStatus = data.memberPaymentStatus as Record<string, BillingMemberStatus> | undefined;
  const iconColor = typeof data.iconColor === 'string' ? data.iconColor : undefined;
  const displayName = subscriptionDisplayName(serviceName, planName);

  return {
    id,
    displayName,
    serviceNameForIcon: serviceName || displayName,
    billingCycle,
    billingDayLabel,
    totalCents,
    yourShareCents,
    dotColor: resolveDotColor(iconColor, serviceName || displayName),
    statusBadge: buildStatusBadge(memberPaymentStatus, viewerUid, {
      pendingAcceptanceCount: countPendingMemberAcceptances(data),
    }),
  };
}

export type MonthSummary = {
  totalBillingCents: number;
  yourShareCents: number;
  paidSoFarCents: number;
  upcomingCents: number;
};

export function computeMonthSummaryDetailed(
  instances: { billDate: Date; sub: BillingCalendarSubscription }[],
  today: Date
): MonthSummary {
  const t0 = startOfLocalDay(today);
  let totalBillingCents = 0;
  let yourShareCents = 0;
  let paidSoFarCents = 0;
  let upcomingCents = 0;

  for (const { billDate, sub } of instances) {
    totalBillingCents += sub.totalCents;
    yourShareCents += sub.yourShareCents;
    const b0 = startOfLocalDay(billDate);

    const label = sub.statusBadge.label.toLowerCase();
    const youPaid = label === 'paid' || label === 'all paid';

    if (b0.getTime() < t0.getTime()) {
      if (youPaid) paidSoFarCents += sub.yourShareCents;
      else upcomingCents += sub.yourShareCents;
    } else {
      upcomingCents += sub.yourShareCents;
    }
  }

  return { totalBillingCents, yourShareCents, paidSoFarCents, upcomingCents };
}

export function billsForMonth(
  subs: BillingCalendarSubscription[],
  year: number,
  monthIndex: number
): { billDate: Date; sub: BillingCalendarSubscription }[] {
  const out: { billDate: Date; sub: BillingCalendarSubscription }[] = [];
  for (const sub of subs) {
    const parsed = parseBillingDayParam(sub.billingDayLabel);
    if (!parsed) continue;
    const billDate = subscriptionBillsOnDate(sub, year, monthIndex, parsed, sub.billingCycle);
    if (!billDate) continue;
    out.push({ billDate, sub });
  }
  return out;
}

export function subscriptionsByDayKey(
  instances: { billDate: Date; sub: BillingCalendarSubscription }[]
): Map<string, BillingCalendarSubscription[]> {
  const map = new Map<string, BillingCalendarSubscription[]>();
  for (const { billDate, sub } of instances) {
    const k = `${billDate.getFullYear()}-${billDate.getMonth() + 1}-${billDate.getDate()}`;
    const arr = map.get(k) ?? [];
    arr.push(sub);
    map.set(k, arr);
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return map;
}

export function formatSummaryMoney(cents: number): string {
  return fmtCents(cents);
}

type LocaleWeekInfo = { weekInfo?: { firstDay?: number } };

export function getLocaleWeekStartJsDay(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const wi = (new Intl.Locale(locale) as unknown as LocaleWeekInfo).weekInfo;
    const fd = wi?.firstDay;
    if (fd === 7) return 0;
    if (fd === 1) return 1;
    if (fd === 2) return 2;
    if (fd === 3) return 3;
    if (fd === 4) return 4;
    if (fd === 5) return 5;
    if (fd === 6) return 6;
  } catch {
    /* ignore */
  }
  return 0;
}

export type CalendarCellModel = {
  key: string;
  date: Date;
  inCurrentMonth: boolean;
  dayOfMonth: number;
  isToday: boolean;
  dotColors: string[];
  overflowCount: number;
};

const MAX_DOTS = 3;

export function buildCalendarGrid(
  year: number,
  monthIndex: number,
  today: Date,
  byDay: Map<string, BillingCalendarSubscription[]>
): CalendarCellModel[] {
  const weekStart = getLocaleWeekStartJsDay();
  const first = new Date(year, monthIndex, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const t0 = startOfLocalDay(today);

  const cells: CalendarCellModel[] = [];
  const prevDim = new Date(year, monthIndex, 0).getDate();

  for (let i = 0; i < lead; i++) {
    const dom = prevDim - lead + i + 1;
    const d = new Date(year, monthIndex - 1, dom);
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const subs = byDay.get(k) ?? [];
    const colors = subs.map((s) => s.dotColor);
    const overflow = Math.max(0, colors.length - MAX_DOTS);
    cells.push({
      key: `p-${k}`,
      date: d,
      inCurrentMonth: false,
      dayOfMonth: dom,
      isToday: startOfLocalDay(d).getTime() === t0.getTime(),
      dotColors: colors.slice(0, MAX_DOTS),
      overflowCount: overflow,
    });
  }

  for (let dom = 1; dom <= dim; dom++) {
    const d = new Date(year, monthIndex, dom);
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const subs = byDay.get(k) ?? [];
    const colors = subs.map((s) => s.dotColor);
    const overflow = Math.max(0, colors.length - MAX_DOTS);
    cells.push({
      key: `c-${k}`,
      date: d,
      inCurrentMonth: true,
      dayOfMonth: dom,
      isToday: startOfLocalDay(d).getTime() === t0.getTime(),
      dotColors: colors.slice(0, MAX_DOTS),
      overflowCount: overflow,
    });
  }

  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= tail; i++) {
    const d = new Date(year, monthIndex + 1, i);
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const subs = byDay.get(k) ?? [];
    const colors = subs.map((s) => s.dotColor);
    const overflow = Math.max(0, colors.length - MAX_DOTS);
    cells.push({
      key: `n-${k}`,
      date: d,
      inCurrentMonth: false,
      dayOfMonth: i,
      isToday: startOfLocalDay(d).getTime() === t0.getTime(),
      dotColors: colors.slice(0, MAX_DOTS),
      overflowCount: overflow,
    });
  }

  /** Pad to 6 full weeks (42 cells) with following-month dates, greyed in UI — avoids short last rows. */
  let nextDom = tail;
  while (cells.length < 42) {
    nextDom += 1;
    const d = new Date(year, monthIndex + 1, nextDom);
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const subs = byDay.get(k) ?? [];
    const colors = subs.map((s) => s.dotColor);
    const overflow = Math.max(0, colors.length - MAX_DOTS);
    cells.push({
      key: `n-${k}`,
      date: d,
      inCurrentMonth: false,
      dayOfMonth: d.getDate(),
      isToday: startOfLocalDay(d).getTime() === t0.getTime(),
      dotColors: colors.slice(0, MAX_DOTS),
      overflowCount: overflow,
    });
  }

  return cells;
}

export function weekdayLabelsShort(): string[] {
  const weekStart = getLocaleWeekStartJsDay();
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dow = (weekStart + i) % 7;
    const ref = new Date(2024, 0, dow + 7);
    labels.push(ref.toLocaleDateString(undefined, { weekday: 'narrow' }));
  }
  return labels;
}
