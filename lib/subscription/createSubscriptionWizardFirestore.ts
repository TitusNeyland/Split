import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase';
import { getNextFirstChargeDate } from './billingDayFormat';
import { hasInvitePendingInShares } from './subscriptionSplitRecalc';

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
  /** Existing `invites/{id}` when editing a pending slot (avoid creating duplicate invites). */
  inviteId?: string;
};

export type CreateSubscriptionWizardInput = {
  actorUid: string;
  serviceName: string;
  /** Preset catalog id (e.g. `netflix`) when chosen from the picker; omitted for custom services. */
  serviceId?: string;
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

/** Stored on each member row; maps wizard methods to persisted split method. */
export type StoredMemberSplitMethod = 'equal' | 'custom_percent' | 'fixed' | 'owner_less';

export function splitMethodForMemberRow(w: WizardSplitMethod): StoredMemberSplitMethod {
  if (w === 'fixed_amount') return 'fixed';
  if (w === 'owner_less') return 'owner_less';
  if (w === 'custom_percent') return 'custom_percent';
  return 'equal';
}

/** True for real Firebase Auth uids (excludes invite-email-* placeholders). */
export function isLikelyFirebaseUid(uid: string): boolean {
  if (!uid || uid.length < 20) return false;
  if (uid.startsWith('invite-')) return false;
  return /^[a-zA-Z0-9]+$/.test(uid);
}

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
 * `memberUids`: real Firebase uids only (owner + on-app invitees) for array-contains queries.
 * `members`: roster objects with `memberStatus` (owner active; invitees pending until accepted).
 * `activeMemberUids`: accepted members only (owner alone until invitees accept).
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

  const sm = splitMethodForMemberRow(input.splitMethod);

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
      /** Every invitee starts pending acceptance (including friends already on the app). */
      invitePending: m.role !== 'owner',
    };
    if (m.invitePending && typeof m.pendingInviteEmail === 'string' && m.pendingInviteEmail.trim()) {
      row.pendingInviteEmail = m.pendingInviteEmail.trim().toLowerCase();
    }
    return row;
  });

  const shareArr = splitMemberShares as { role?: string; invitePending?: boolean }[];
  if (hasInvitePendingInShares(shareArr)) {
    const oi = splitMemberShares.findIndex((s) => s && (s as { role?: string }).role === 'owner');
    if (oi >= 0) {
      splitMemberShares[oi] = {
        ...splitMemberShares[oi],
        amountCents: input.totalCents,
      };
    }
  }

  const memberRoster: Record<string, unknown>[] = input.members.map((m) => {
    const id = persistMemberId(m, input.actorUid);
    const pct = Math.round(m.percent * 100) / 100;
    if (m.role === 'owner') {
      return {
        uid: id,
        memberStatus: 'active',
        paymentStatus: 'pending',
        percentage: pct,
        fixedAmount: m.amountCents,
        splitMethod: sm,
        // Firestore forbids serverTimestamp() inside array elements; use client Timestamp.
        acceptedAt: Timestamp.now(),
      };
    }
    const row: Record<string, unknown> = {
      memberStatus: 'pending',
      paymentStatus: null,
      percentage: pct,
      fixedAmount: m.amountCents,
      splitMethod: sm,
      invitedAt: Timestamp.now(),
    };
    if (id) row.uid = id;
    if (m.invitePending && typeof m.pendingInviteEmail === 'string' && m.pendingInviteEmail.trim()) {
      row.email = m.pendingInviteEmail.trim().toLowerCase();
    }
    return row;
  });

  const memberPaymentStatus: Record<string, string> = {};
  for (const m of input.members) {
    const id = persistMemberId(m, input.actorUid);
    if (m.role === 'owner') {
      memberPaymentStatus[id] = 'owner';
    } else {
      memberPaymentStatus[id] = 'invited_pending';
    }
  }

  const memberUids: string[] = [input.actorUid];
  for (const m of input.members) {
    if (m.role === 'owner') continue;
    const id = persistMemberId(m, input.actorUid);
    if (isLikelyFirebaseUid(id)) memberUids.push(id);
  }

  const col = collection(db, 'subscriptions');
  const docRef = await addDoc(col, {
    ownerUid: input.actorUid,
    serviceName: input.serviceName,
    ...(input.serviceId?.trim() ? { serviceId: input.serviceId.trim() } : {}),
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
    memberUids,
    activeMemberUids: [input.actorUid],
    members: memberRoster,
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
