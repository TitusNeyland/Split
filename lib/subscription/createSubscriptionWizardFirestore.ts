import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase';
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
  /** When invite is email-targeted; stored on split share rows for resend + rules. */
  pendingInviteEmail?: string;
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
 * After a subscription doc exists: calls `finalizeSubscriptionWizard` to send FCM to members on the
 * split (non-owner, not invite-pending) and a confirmation push to the owner. Stripe PaymentIntents
 * for `autoCharge` are created by the scheduled `advanceBillingCycles` function when due.
 */
export async function runSubscriptionWizardSideEffects(
  subscriptionId: string,
  _input: CreateSubscriptionWizardInput
): Promise<void> {
  const fns = getFirebaseFunctions();
  if (!fns) return;

  try {
    const finalize = httpsCallable<{ subscriptionId: string }, { ok?: boolean; skipped?: boolean }>(
      fns,
      'finalizeSubscriptionWizard'
    );
    await finalize({ subscriptionId });
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code !== 'functions/not-found') {
      console.warn('finalizeSubscriptionWizard:', e);
    }
  }
}

/**
 * Creates `subscriptions/{id}` plus an initial `billing_cycles` doc.
 * `members` / `memberUids` list every split participant so subscription tab queries resolve.
 */
/** Wizard UI uses a placeholder (e.g. `owner-self`); Firestore rules require the real uid in `members`. */
export function persistMemberId(m: WizardMemberRow, actorUid: string): string {
  if (m.role === 'owner') return actorUid;
  return m.memberId;
}

export async function createSubscriptionFromWizard(
  input: CreateSubscriptionWizardInput
): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const splitMemberShares = input.members.map((m) => {
    const id = persistMemberId(m, input.actorUid);
    const row: Record<string, unknown> = {
      memberId: id,
      displayName: m.displayName,
      role: m.role,
      percent: Math.round(m.percent * 100) / 100,
      amountCents: m.amountCents,
      initials: m.initials,
      avatarBg: m.avatarBg,
      avatarColor: m.avatarColor,
      invitePending: Boolean(m.invitePending),
    };
    if (m.invitePending && typeof m.pendingInviteEmail === 'string' && m.pendingInviteEmail.trim()) {
      row.pendingInviteEmail = m.pendingInviteEmail.trim().toLowerCase();
    }
    return row;
  });

  const memberPaymentStatus: Record<string, string> = {};
  for (const m of input.members) {
    const id = persistMemberId(m, input.actorUid);
    if (m.role === 'owner') {
      memberPaymentStatus[id] = 'owner';
    } else if (m.invitePending) {
      memberPaymentStatus[id] = 'invited_pending';
    } else {
      memberPaymentStatus[id] = 'pending';
    }
  }

  const memberIds = input.members
    .map((m) => persistMemberId(m, input.actorUid))
    .filter((id): id is string => Boolean(id));

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
    /** Uid strings for `array-contains` queries; mirrors `members`. */
    memberUids: memberIds,
    members: memberIds,
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
