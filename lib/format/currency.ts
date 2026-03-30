/** en-US grouping for USD (e.g. $5,000.00). */

function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...opts });
}

const usd2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = nf({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
const usdFlex = nf({ minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Cents → dollars with two decimal places and grouping (e.g. subscription totals). */
export function formatUsdFromCents(cents: number): string {
  if (!Number.isFinite(cents)) return usd2.format(0);
  return usd2.format(cents / 100);
}

/** Dollar amount with two decimal places (e.g. friend balances, home list amounts). */
export function formatUsdDollarsFixed2(dollars: number): string {
  if (!Number.isFinite(dollars)) return usd2.format(0);
  return usd2.format(dollars);
}

/** Whole dollars, grouping, no cents (e.g. lifetime savings headline). */
export function formatUsdDollarsWhole(dollars: number): string {
  if (!Number.isFinite(dollars)) return usd0.format(0);
  return usd0.format(Math.round(dollars));
}

/** Omits unnecessary trailing zeros but keeps up to two decimals (e.g. profile “Collected total”). */
export function formatUsdDollarsFlexible(dollars: number): string {
  if (!Number.isFinite(dollars)) return usdFlex.format(0);
  return usdFlex.format(dollars);
}
