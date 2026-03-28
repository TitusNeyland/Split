/**
 * Next occurrence of `billingDay` (1–31) on or after today (local calendar).
 */
export function getNextBillingDate(billingDay: number): string {
  const today = new Date();
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), billingDay);
  const nextDate =
    thisMonth > today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, billingDay);

  return nextDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
