import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import { createPendingInvite } from '../friends/friendSystemFirestore';
import { hasInvitePendingInShares, syncOwnerShareForPendingInvites, type SubscriptionMemberRosterRow } from './subscriptionSplitRecalc';
import {
  isLikelyFirebaseUid,
  persistMemberId,
  runSubscriptionWizardSideEffects,
  splitMethodForMemberRow,
  type CreateSubscriptionWizardInput,
  type WizardMemberRow,
  type WizardSplitMethod,
} from './createSubscriptionWizardFirestore';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Owner-only full subscription update: roster, shares, uid lists, payment map.
 * New invite rows get `invites/{id}` via {@link createPendingInvite} (same as create flow).
 */
export async function saveSubscriptionEditSplitToFirestore(opts: {
  subscriptionId: string;
  ownerUid: string;
  totalCents: number;
  /** Same values as create wizard. */
  splitMethod: WizardSplitMethod;
  members: WizardMemberRow[];
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  const subRef = doc(db, 'subscriptions', opts.subscriptionId);
  const snap = await getDoc(subRef);
  if (!snap.exists()) throw new Error('Subscription not found.');

  const prev = snap.data() as Record<string, unknown>;
  const ownerUid = String(prev.ownerUid ?? '');
  if (ownerUid !== opts.ownerUid) throw new Error('Only the split owner can edit this split.');

  const prevMps =
    prev.memberPaymentStatus && typeof prev.memberPaymentStatus === 'object' && !Array.isArray(prev.memberPaymentStatus)
      ? { ...(prev.memberPaymentStatus as Record<string, string>) }
      : {};

  const input: CreateSubscriptionWizardInput = {
    actorUid: opts.ownerUid,
    serviceName: String(prev.serviceName ?? 'Subscription'),
    serviceId: typeof prev.serviceId === 'string' ? prev.serviceId : undefined,
    planName: String(prev.planName ?? ''),
    iconColor: typeof prev.iconColor === 'string' ? prev.iconColor : '#534AB7',
    totalCents: opts.totalCents,
    billingCycle: prev.billingCycle === 'yearly' ? 'yearly' : 'monthly',
    billingDay: String(prev.billingDayLabel ?? ''),
    payerDisplay: String(prev.payerDisplay ?? ''),
    autoCharge: prev.autoCharge === true,
    splitMethod: opts.splitMethod,
    members: opts.members,
  };

  const sm = splitMethodForMemberRow(input.splitMethod);

  const prevShares = Array.isArray(prev.splitMemberShares) ? (prev.splitMemberShares as Record<string, unknown>[]) : [];

  const splitMemberShares: Record<string, unknown>[] = input.members.map((m) => {
    const id = persistMemberId(m, input.actorUid);
    const prevRow = prevShares.find((s) => s && String((s as { memberId?: string }).memberId ?? '') === id);
    const row: Record<string, unknown> = {
      memberId: id,
      displayName: m.displayName,
      role: m.role,
      percent: Math.round(m.percent * 100) / 100,
      amountCents: m.amountCents,
      initials: m.initials,
      avatarBg: m.avatarBg,
      avatarColor: m.avatarColor,
      invitePending: m.role !== 'owner' && Boolean(m.invitePending),
    };
    if (m.invitePending && typeof m.pendingInviteEmail === 'string' && m.pendingInviteEmail.trim()) {
      row.pendingInviteEmail = m.pendingInviteEmail.trim().toLowerCase();
    }
    if (m.role !== 'owner' && m.invitePending && prevRow && typeof prevRow.inviteId === 'string') {
      row.inviteId = prevRow.inviteId;
      row.inviteExpiresAt = prevRow.inviteExpiresAt ?? Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
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

  for (let i = 0; i < input.members.length; i++) {
    const m = input.members[i]!;
    if (m.role === 'owner') continue;
    if (!m.invitePending) continue;
    const id = persistMemberId(m, input.actorUid);
    const share = splitMemberShares[i] as Record<string, unknown>;
    const existingInviteId =
      (typeof m.inviteId === 'string' && m.inviteId.trim() ? m.inviteId.trim() : '') ||
      (typeof share.inviteId === 'string' ? share.inviteId : '');
    if (existingInviteId) {
      share.inviteId = existingInviteId;
      share.inviteExpiresAt =
        share.inviteExpiresAt ??
        prevShares.find((s) => s && String((s as { memberId?: string }).memberId ?? '') === id)?.inviteExpiresAt ??
        Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
      continue;
    }
    const inviteId = await createPendingInvite({
      creatorUid: opts.ownerUid,
      splitId: opts.subscriptionId,
      recipientEmailRaw: m.pendingInviteEmail ?? undefined,
      connectedVia: 'split_invite',
    });
    share.inviteId = inviteId;
    share.invitePending = true;
    share.inviteExpiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
  }

  const memberRoster: Record<string, unknown>[] = input.members.map((m, i) => {
    const id = persistMemberId(m, input.actorUid);
    const pct = Math.round(m.percent * 100) / 100;
    const share = splitMemberShares[i] as { inviteId?: unknown; inviteExpiresAt?: unknown };
    const prevRoster =
      prev.members && Array.isArray(prev.members)
        ? (prev.members as Record<string, unknown>[]).find((r) => String(r?.uid ?? '') === id)
        : undefined;
    if (m.role === 'owner') {
      return {
        uid: id,
        memberStatus: 'active',
        paymentStatus: 'owner',
        percentage: pct,
        fixedAmount: m.amountCents,
        splitMethod: sm,
        acceptedAt: prevRoster?.acceptedAt ?? Timestamp.now(),
      };
    }
    const row: Record<string, unknown> = {
      memberStatus: m.invitePending ? 'pending' : 'active',
      paymentStatus: m.invitePending ? null : (prevMps[id] as string | undefined) ?? 'pending',
      percentage: pct,
      fixedAmount: m.amountCents,
      splitMethod: sm,
    };
    if (id) row.uid = id;
    if (m.invitePending) {
      row.invitedAt = prevRoster?.invitedAt ?? Timestamp.now();
      row.inviteExpiresAt = share.inviteExpiresAt ?? Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
      if (typeof share.inviteId === 'string') row.inviteId = share.inviteId;
    }
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
    } else if (m.invitePending) {
      memberPaymentStatus[id] = 'invited_pending';
    } else {
      memberPaymentStatus[id] = prevMps[id] && prevMps[id] !== 'invited_pending' ? prevMps[id]! : 'pending';
    }
  }

  const memberUids: string[] = [input.actorUid];
  for (const m of input.members) {
    if (m.role === 'owner') continue;
    const id = persistMemberId(m, input.actorUid);
    if (isLikelyFirebaseUid(id) && !memberUids.includes(id)) memberUids.push(id);
  }

  const activeMemberUids: string[] = [];
  for (const m of input.members) {
    const id = persistMemberId(m, input.actorUid);
    if (m.role === 'owner') {
      activeMemberUids.push(id);
    } else if (!m.invitePending && isLikelyFirebaseUid(id)) {
      activeMemberUids.push(id);
    }
  }

  const totalCents =
    typeof prev.totalCents === 'number' && Number.isFinite(prev.totalCents) ? Math.round(prev.totalCents) : opts.totalCents;
  const rosterTyped = memberRoster as unknown as SubscriptionMemberRosterRow[];
  const syncedShares = syncOwnerShareForPendingInvites(
    splitMemberShares as Record<string, unknown>[],
    totalCents,
    rosterTyped
  );

  await updateDoc(subRef, {
    splitMethod: input.splitMethod,
    splitMemberShares: syncedShares,
    memberPaymentStatus,
    memberUids,
    activeMemberUids,
    members: memberRoster,
    splitUpdatedAt: serverTimestamp(),
    splitLastEditedByUid: opts.ownerUid,
    customSplitNeedsRebalance: false,
    splitPendingEffectiveFrom: deleteField(),
  });

  await addDoc(collection(subRef, 'split_change_log'), {
    createdAt: serverTimestamp(),
    actorUid: opts.ownerUid,
    method: opts.splitMethod,
    memberShares: syncedShares,
    effectiveFrom: null,
    source: 'edit_split',
  });

  await runSubscriptionWizardSideEffects(opts.subscriptionId, input, { isUpdate: true });
}
