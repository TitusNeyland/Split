import { initialsFromName } from '../profile/profile';
import type {
  SubscriptionDetailEditorMember,
  SubscriptionDetailMember,
  SubscriptionDetailModel,
  SubscriptionHistoryCycle,
} from './subscriptionDetailTypes';

function viewerYouDisplayName(viewerFirstName: string): string {
  const n = viewerFirstName.trim() || 'You';
  return `${n} (you)`;
}

export type SubscriptionPrefillParamPayload = {
  displayName: string;
  serviceId?: string;
  totalCents: number;
  isOwner?: boolean;
};

/**
 * Parses JSON from `prefillData` navigation param (Activity tab → subscription detail).
 */
export function parseSubscriptionDetailPrefillParam(
  raw: string | string[] | undefined
): SubscriptionPrefillParamPayload | null {
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  if (!s || typeof s !== 'string') return null;
  try {
    const o = JSON.parse(s) as unknown;
    if (!o || typeof o !== 'object') return null;
    const p = o as Record<string, unknown>;
    const nameRaw =
      typeof p.name === 'string'
        ? p.name
        : typeof p.displayName === 'string'
          ? p.displayName
          : '';
    const displayName = nameRaw.trim();
    if (!displayName) return null;
    const serviceId = typeof p.serviceId === 'string' && p.serviceId.trim() ? p.serviceId.trim() : undefined;
    let totalCents = 0;
    if (typeof p.totalCents === 'number' && Number.isFinite(p.totalCents)) {
      totalCents = Math.round(p.totalCents);
    } else if (typeof p.totalCost === 'number' && Number.isFinite(p.totalCost)) {
      totalCents = Math.round(p.totalCost);
    }
    const isOwner = typeof p.isOwner === 'boolean' ? p.isOwner : undefined;
    return { displayName, serviceId, totalCents, isOwner };
  } catch {
    return null;
  }
}

/**
 * Minimal subscription detail model so the detail screen can render hero + one row before Firestore arrives.
 */
export function buildSubscriptionDetailPrefillPlaceholder(
  subscriptionId: string,
  viewerUid: string,
  userAvatarUrl: string | null,
  viewerFirstName: string,
  input: {
    displayName: string;
    serviceId?: string;
    totalCents: number;
    isOwner?: boolean;
  }
): SubscriptionDetailModel {
  const displayName = input.displayName.trim() || 'Subscription';
  const totalCents = Math.max(0, Math.round(input.totalCents));
  const isOwner = input.isOwner ?? false;
  const memberId = viewerUid;
  const youLabel = viewerYouDisplayName(viewerFirstName);
  const member: SubscriptionDetailMember = {
    memberId,
    displayName: youLabel,
    initials: initialsFromName(viewerFirstName.trim() || 'You'),
    avatarBg: '#E8E6E1',
    avatarColor: '#1a1a18',
    avatarUrl: userAvatarUrl ?? undefined,
    percent: 100,
    amountCents: totalCents,
    cycleStatus: 'pending',
  };
  const editor: SubscriptionDetailEditorMember = {
    memberId,
    displayName: youLabel,
    initials: member.initials,
    avatarBg: member.avatarBg,
    avatarColor: member.avatarColor,
    avatarUrl: userAvatarUrl ?? null,
  };
  const history: SubscriptionHistoryCycle[] = [
    {
      key: 'current',
      label: 'Current cycle',
      totalCents,
      allPaid: false,
      lines: [
        {
          memberId,
          displayName: youLabel,
          amountCents: totalCents,
          paid: false,
        },
      ],
    },
  ];
  return {
    id: subscriptionId,
    serviceName: displayName,
    serviceId: input.serviceId,
    displayName,
    billingCycleLabel: '—',
    nextBillingLabel: '—',
    totalCents,
    isOwner,
    payerName: isOwner ? undefined : 'Owner',
    autoCharge: 'off',
    lifecycleStatus: 'active',
    members: [member],
    paidMemberCount: 0,
    collectedCents: 0,
    activeMembersTotalCents: totalCents,
    editorMembers: [editor],
    history,
  };
}
