import { mapFirestoreDocToCalendarSubscription, type BillingCalendarSubscription } from './billingCalendarModel';

/**
 * Demo calendar rows for Titus (member id `1`) — matches `subscriptionDetailDemo` / subscription cards.
 */
export function getBillingCalendarDemoSubscriptions(): BillingCalendarSubscription[] {
  const viewer = '1';

  const docs: Record<string, unknown>[] = [
    {
      status: 'active',
      serviceName: 'Netflix',
      planName: 'Premium',
      billingCycle: 'monthly',
      billingDayLabel: 'Every 18th',
      totalCents: 2299,
      iconColor: '',
      splitMemberShares: [
        { memberId: '1', amountCents: 766 },
        { memberId: '2', amountCents: 767 },
        { memberId: '3', amountCents: 766 },
      ],
      memberPaymentStatus: { '1': 'owner', '2': 'paid', '3': 'pending' },
    },
    {
      status: 'active',
      serviceName: 'Spotify',
      planName: 'Family',
      billingCycle: 'monthly',
      billingDayLabel: 'Every 25th',
      totalCents: 1699,
      iconColor: '',
      splitMemberShares: [
        { memberId: '1', amountCents: 340 },
        { memberId: '2', amountCents: 340 },
        { memberId: '3', amountCents: 339 },
        { memberId: '4', amountCents: 340 },
        { memberId: '5', amountCents: 340 },
      ],
      memberPaymentStatus: {
        '1': 'paid',
        '2': 'paid',
        '3': 'paid',
        '4': 'paid',
        '5': 'paid',
      },
    },
    {
      status: 'active',
      serviceName: 'iCloud',
      planName: '2TB',
      billingCycle: 'monthly',
      billingDayLabel: 'Every 3rd',
      totalCents: 999,
      iconColor: '',
      splitMemberShares: [
        { memberId: '1', amountCents: 250 },
        { memberId: '2', amountCents: 250 },
        { memberId: '3', amountCents: 249 },
        { memberId: '4', amountCents: 250 },
      ],
      memberPaymentStatus: {
        '1': 'pending',
        '2': 'pending',
        '3': 'pending',
        '4': 'pending',
      },
    },
  ];

  const ids = ['demo-netflix-premium', 'demo-spotify-family', 'demo-icloud-2tb'];

  const out: BillingCalendarSubscription[] = [];
  for (let i = 0; i < ids.length; i++) {
    const row = mapFirestoreDocToCalendarSubscription(ids[i]!, docs[i]!, viewer);
    if (row) out.push(row);
  }
  return out;
}
