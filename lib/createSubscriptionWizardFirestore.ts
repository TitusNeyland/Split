import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { getNextFirstChargeDate } from './billingDayFormat';

export type WizardSplitMethod = 'equal' | 'custom_percent' | 'fixed_amount' | 'owner_less';

export type WizardMemberRow = {
  memberId: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  role: 'owner' | 'member';
  percent: number;
  amountCents: number;
  /** Invited by link / not on app yet — charged after they join and add payment. */
  invitePending?: boolean;
};

export type CreateSubscriptionWizardInput = {
  actorUid: string;
  serviceName: string;
  planName: string;
  iconColor: string;
  totalCents: number;
  billingCycle: 'monthly' | 'yearly';
  billingDay: string;
  payerDisplay: string;
  autoCharge: boolean;
  splitMethod: WizardSplitMethod;
  members: WizardMemberRow[];
};

/**
 * After a subscription doc exists: server-side jobs should send push invites to non-owners,
 * set payment rows, and (when `autoCharge`) schedule Stripe PaymentIntents for the billing date.
 * Wire this to Cloud Functions / your backend — no client SDK for scheduling intents securely.
 */
export async function runSubscriptionWizardSideEffects(
  _subscriptionId: string,
  _input: CreateSubscriptionWizardInput
): Promise<void> {
  // Intentionally empty — replace with callable/HTTP trigger to FCM + Stripe.
}

/**
 * Creates `subscriptions/{id}` plus an initial `billing_cycles` doc.
 * `members` array is `[ownerUid]` so tab queries work; full roster lives in `splitMemberShares`.
 */
export async function createSubscriptionFromWizard(
  input: CreateSubscriptionWizardInput
): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const splitMemberShares = input.members.map((m) => ({
    memberId: m.memberId,
    displayName: m.displayName,
    role: m.role,
    percent: Math.round(m.percent * 100) / 100,
    amountCents: m.amountCents,
    initials: m.initials,
    avatarBg: m.avatarBg,
    avatarColor: m.avatarColor,
    invitePending: Boolean(m.invitePending),
  }));

  const memberPaymentStatus: Record<string, string> = {};
  for (const m of input.members) {
    if (m.role === 'owner') {
      memberPaymentStatus[m.memberId] = 'owner';
    } else if (m.invitePending) {
      memberPaymentStatus[m.memberId] = 'invited_pending';
    } else {
      memberPaymentStatus[m.memberId] = 'pending';
    }
  }

  const col = collection(db, 'subscriptions');
  const docRef = await addDoc(col, {
    ownerUid: input.actorUid,
    serviceName: input.serviceName,
    planName: input.planName,
    iconColor: input.iconColor,
    totalCents: input.totalCents,
    billingCycle: input.billingCycle,
    billingDayLabel: input.billingDay,
    payerDisplay: input.payerDisplay,
    autoCharge: input.autoCharge,
    splitMethod: input.splitMethod,
    splitMemberShares,
    memberPaymentStatus,
    members: [input.actorUid],
    status: 'active',
    createdAt: serverTimestamp(),
    splitUpdatedAt: serverTimestamp(),
    nextBillingAt: (() => {
      const d = getNextFirstChargeDate(input.billingCycle, input.billingDay);
      return d ? Timestamp.fromDate(d) : null;
    })(),
  });

  const subId = docRef.id;

  await addDoc(collection(docRef, 'billing_cycles'), {
    label: 'current',
    billingDayLabel: input.billingDay,
    totalCents: input.totalCents,
    billingCycle: input.billingCycle,
    status: 'current',
    createdAt: serverTimestamp(),
  });

  return subId;
}
