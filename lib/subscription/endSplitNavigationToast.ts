/** One-shot toast + tab switch (consumed on Subscriptions focus). */
export type SubscriptionsTabFilter = 'active' | 'ended';

export type SubscriptionsTabToastVariant = 'default' | 'success';

type Pending = {
  message: string;
  filter: SubscriptionsTabFilter;
  variant?: SubscriptionsTabToastVariant;
};

let pending: Pending | null = null;

export function setPendingSubscriptionsTabToast(
  message: string,
  filter: SubscriptionsTabFilter,
  variant?: SubscriptionsTabToastVariant
): void {
  pending = { message, filter, variant: variant ?? 'default' };
}

export function consumePendingSubscriptionsTabToast(): Pending | null {
  const p = pending;
  pending = null;
  return p;
}

export function setPendingEndSplitToast(message: string): void {
  setPendingSubscriptionsTabToast(message, 'ended');
}

export function consumePendingEndSplitToast(): Pending | null {
  return consumePendingSubscriptionsTabToast();
}
