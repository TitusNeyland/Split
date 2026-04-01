import type { Router } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import { userDocPhotoUrl } from '../profile/profile';
import { mapFirestoreSubscriptionToDetailModel } from '../subscription/subscriptionDetailFromFirestore';
import { getOwnerId } from '../subscription/subscriptionToCardModel';

export type SplitJoinedRouteParams = Record<string, string>;

function slugifyServiceIdFromName(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'subscription';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Loads subscription + viewer profile and builds string params for `/split-joined`.
 * Retries briefly so Cloud Function merge can land after `acceptPendingInvite`.
 */
export async function buildSplitJoinedCelebrationParams(
  subscriptionId: string,
  viewerUid: string,
  options?: { retries?: number; retryDelayMs?: number }
): Promise<SplitJoinedRouteParams | null> {
  const db = getFirebaseFirestore();
  if (!db || !subscriptionId.trim() || !viewerUid) return null;

  const retries = options?.retries ?? 4;
  const retryDelayMs = options?.retryDelayMs ?? 350;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs);

    const subSnap = await getDoc(doc(db, 'subscriptions', subscriptionId.trim()));
    if (!subSnap.exists()) continue;

    const d = subSnap.data() as Record<string, unknown>;
    const id = subSnap.id;

    const userSnap = await getDoc(doc(db, 'users', viewerUid));
    const ud = userSnap.exists() ? userSnap.data() : {};
    const viewerDisplayName = typeof ud?.displayName === 'string' ? ud.displayName.trim() : '';
    const viewerFirstName = viewerDisplayName.split(/\s+/)[0] || 'You';
    const userAvatarUrl = userDocPhotoUrl(ud as Record<string, unknown>);

    const model = mapFirestoreSubscriptionToDetailModel(
      { ...d, id } as Record<string, unknown> & { id: string },
      viewerUid,
      userAvatarUrl,
      viewerFirstName
    );
    if (!model) continue;

    const serviceNameRaw = typeof d.serviceName === 'string' ? d.serviceName : '';
    const serviceIdFromDoc = typeof d.serviceId === 'string' && d.serviceId.trim() ? d.serviceId.trim() : '';
    const serviceId = serviceIdFromDoc || slugifyServiceIdFromName(serviceNameRaw || model.displayName);

    const ownerUid = getOwnerId(d);
    const ownerRow = model.members.find((m) => m.memberId === ownerUid);
    const ownerDisplayName =
      ownerRow?.displayName?.replace(/\s*\(you\)\s*$/i, '').trim() ||
      model.payerName?.trim() ||
      'Owner';
    const ownerFirst = ownerDisplayName.split(/\s+/)[0] || 'Owner';

    const activeMembers = model.members.filter((m) => !m.invitePending && !m.inviteExpired);
    const nOthers = Math.max(0, activeMembers.length - 2);

    const memberPips = activeMembers.map((m) => ({
      initials: m.initials,
      bg: m.avatarBg,
      color: m.avatarColor,
      highlight: m.memberId === viewerUid,
      uid: m.memberId,
      imageUrl: typeof m.avatarUrl === 'string' && m.avatarUrl.trim() ? m.avatarUrl.trim() : null,
    }));

    const viewerRow = model.members.find((m) => m.memberId === viewerUid);
    const userShareCents =
      viewerRow && typeof viewerRow.amountCents === 'number' && Number.isFinite(viewerRow.amountCents)
        ? Math.round(viewerRow.amountCents)
        : 0;

    return {
      subscriptionId: id,
      subscriptionName: model.displayName,
      serviceId,
      ownerName: ownerDisplayName,
      ownerFirst,
      userShare: String(userShareCents),
      firstCharge: model.nextBillingLabel,
      autoCharge: model.autoCharge,
      memberCount: String(nOthers),
      memberPipsJson: encodeURIComponent(JSON.stringify(memberPips)),
    };
  }

  return null;
}

/**
 * Navigates to `/split-joined` with Firestore-derived params, or returns false so callers can fall back.
 */
export async function replaceWithSplitJoinedCelebration(
  router: Router,
  subscriptionId: string,
  viewerUid: string
): Promise<boolean> {
  const params = await buildSplitJoinedCelebrationParams(subscriptionId, viewerUid);
  if (!params) return false;
  router.replace({ pathname: '/split-joined', params });
  return true;
}
