/** One-shot toast + tab switch after ending a split (consumed on Subscriptions focus). */
type Pending = { message: string; filter: 'ended' };

let pending: Pending | null = null;

export function setPendingEndSplitToast(message: string): void {
  pending = { message, filter: 'ended' };
}

export function consumePendingEndSplitToast(): Pending | null {
  const p = pending;
  pending = null;
  return p;
}
