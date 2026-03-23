/** e.g. 1 → "1st", 22 → "22nd" */
export function ordinalDay(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_NAMES_LOWER = MONTH_NAMES.map((m) => m.toLowerCase());

export function formatBillingDayFieldLabel(
  cycle: 'monthly' | 'yearly',
  day: number,
  monthIndex: number,
): string {
  if (cycle === 'monthly') return `Every ${ordinalDay(day)}`;
  return `${MONTH_NAMES[monthIndex] ?? 'January'} ${ordinalDay(day)}`;
}

export function parseBillingDayParam(
  raw: string,
): { day: number; monthIndex: number } | null {
  let t = raw.trim();
  if (!t) return null;

  const eachYearStrip = t.match(/^(.+?)\s+each\s+year\.?$/i);
  if (eachYearStrip) t = eachYearStrip[1]!.trim();

  const everyMatch = t.match(/^every\s+(\d{1,2})(?:st|nd|th|rd)?$/i);
  if (everyMatch) {
    const day = parseInt(everyMatch[1], 10);
    if (day >= 1 && day <= 31) return { day, monthIndex: new Date().getMonth() };
  }

  const monthlyMatch = t.match(/^(\d{1,2})(?:st|nd|th|rd)?\s+of\s+each\s+month$/i);
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1], 10);
    if (day >= 1 && day <= 31) return { day, monthIndex: new Date().getMonth() };
  }

  for (let i = 0; i < MONTH_NAMES_LOWER.length; i++) {
    const re = new RegExp(
      `^${MONTH_NAMES_LOWER[i]}\\s+(\\d{1,2})(?:st|nd|th|rd)?$`,
      'i',
    );
    const m = t.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      if (day >= 1 && day <= 31) return { day, monthIndex: i };
    }
  }

  const plain = t.match(/^(\d{1,2})$/);
  if (plain) {
    const day = parseInt(plain[1], 10);
    if (day >= 1 && day <= 31) return { day, monthIndex: new Date().getMonth() };
  }
  return null;
}

export function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, day), dim);
}

export function showShortMonthBillingWarning(day: number): boolean {
  return day >= 29;
}

/**
 * Phrasing for auto-charge / invite copy (e.g. after “on …”).
 * Monthly labels in the UI are short (`Every 18th`); this expands slightly for sentences.
 */
export function billingWhenForSentence(
  cycle: 'monthly' | 'yearly',
  billingDayLabel: string,
): string {
  const d = billingDayLabel.trim();
  if (!d) return 'your billing day';
  if (cycle === 'yearly') {
    if (/\beach\s+year$/i.test(d)) return d;
    return `${d} each year`;
  }
  const parsed = parseBillingDayParam(d);
  if (parsed) return `the ${ordinalDay(parsed.day)} each month`;
  return d;
}
