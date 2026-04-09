import { formatUsdFromCents } from './currency';

/**
 * Format a member's share amount with optional percentage.
 * - When `includePercent` is true: returns '$7.66 · 33%'
 * - When `includePercent` is false: returns '$7.66'
 */
export function formatMemberAmount(
  amountCents: number,
  percent?: number,
  includePercent: boolean = false
): string {
  const amountStr = formatUsdFromCents(amountCents);
  
  if (!includePercent || percent == null || !Number.isFinite(percent)) {
    return amountStr;
  }
  
  const pctStr = Number.isInteger(percent) || Math.abs(percent - Math.round(percent)) < 1e-6
    ? `${Math.round(percent)}%`
    : `${percent.toFixed(1)}%`;
  
  return `${amountStr} · ${pctStr}`;
}
