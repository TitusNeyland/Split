const crypto = require('crypto');
const admin = require('firebase-admin');
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const functions = require('firebase-functions/v1');

// Stripe is optional — set STRIPE_SECRET_KEY in Firebase Functions secrets to enable auto-charge.
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

setGlobalOptions({ region: 'us-central1' });

admin.initializeApp();

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function sortedFriendshipUsers(uidA, uidB) {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

function friendshipDocId(uidA, uidB) {
  const [a, b] = sortedFriendshipUsers(uidA, uidB);
  return `${a}_${b}`;
}

async function incrementUnreadNotificationCount(db, uid) {
  if (typeof uid !== 'string' || !uid) return;
  await db.collection('users').doc(uid).set(
    { unreadNotificationCount: admin.firestore.FieldValue.increment(1) },
    { merge: true }
  );
}

// --- Activity feed: users/{uid}/activity (server writes only) ---

async function getUserDisplayName(db, uid) {
  if (typeof uid !== 'string' || !uid) return 'Someone';
  const snap = await db.collection('users').doc(uid).get();
  const dn = snap.data()?.displayName;
  return typeof dn === 'string' && dn.trim() ? dn.trim() : 'Someone';
}

/** Prefer Firestore `photoURL`, then legacy `avatarUrl` (matches client `userDocPhotoUrl`). */
function userPhotoUrlFromUserData(d) {
  if (!d || typeof d !== 'object') return null;
  if (typeof d.photoURL === 'string' && d.photoURL.trim()) return d.photoURL.trim();
  if (typeof d.avatarUrl === 'string' && d.avatarUrl.trim()) return d.avatarUrl.trim();
  return null;
}

async function getUserPhotoUrl(db, uid) {
  if (typeof uid !== 'string' || !uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  return userPhotoUrlFromUserData(snap.data() || {});
}

function slugifyServiceIdFromName(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || 'unknown';
}

function subscriptionLabelFromData(sub) {
  const sn =
    typeof sub.serviceName === 'string' && sub.serviceName.trim()
      ? sub.serviceName.trim()
      : typeof sub.planName === 'string' && sub.planName.trim()
        ? sub.planName.trim()
        : 'Subscription';
  return sn;
}

function shortBrandName(fullName) {
  const t = (fullName || '').trim();
  if (!t) return 'Subscription';
  return t.split(/\s+/)[0] || t;
}

function formatCycleMonthLabel(ts) {
  const d = ts.toDate();
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

async function appendActivityEvent(db, uid, data) {
  if (typeof uid !== 'string' || !uid) return;
  await db.collection('users').doc(uid).collection('activity').add({
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...data,
  });
}

function inferConnectedVia(data) {
  if (data.splitId) return 'split_invite';
  const v = data.connectedVia;
  if (v === 'contacts' || v === 'direct_invite' || v === 'split_invite') return v;
  return 'direct_invite';
}

/** For activity metadata; maps user_search → search. */
function normalizeActivityConnectedVia(v) {
  if (v === 'user_search') return 'search';
  if (v === 'search') return 'search';
  if (v === 'contacts') return 'contacts';
  if (v === 'split_invite') return 'split_invite';
  if (v === 'direct_invite') return 'direct_invite';
  return typeof v === 'string' && v ? v : 'unknown';
}

function initialsFromDisplayName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || '';
    const b = parts[parts.length - 1][0] || '';
    return `${a}${b}`.toUpperCase() || '?';
  }
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

/**
 * Fan-out activity to every uid in `memberUids` (deduped).
 */
async function appendActivityEventToMembers(db, memberUids, payload) {
  const seen = new Set();
  for (const uid of memberUids) {
    if (typeof uid !== 'string' || !uid || seen.has(uid)) continue;
    seen.add(uid);
    try {
      await appendActivityEvent(db, uid, payload);
    } catch (e) {
      console.warn('appendActivityEventToMembers: failed for', uid, e?.message || e);
    }
  }
}

async function writeAutoChargeActivity(db, subId, sub, enabled) {
  const ownerUid = sub.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid) return;
  const subName = subscriptionLabelFromData(sub);
  const serviceId = slugifyServiceIdFromName(subName);
  const actorName = await getUserDisplayName(db, ownerUid);
  const memberUids = Array.isArray(sub.memberUids) ? sub.memberUids : [];
  const type = enabled ? 'auto_charge_enabled' : 'auto_charge_disabled';
  await appendActivityEventToMembers(db, memberUids, {
    type,
    subscriptionId: subId,
    subscriptionName: subName,
    serviceId,
    actorUid: ownerUid,
    actorName,
    metadata: {},
  });
}

function hasInvitePendingInShares(shares) {
  return shares.some((s) => s && s.role !== 'owner' && s.invitePending);
}

function applyPlannedAmountsFromMemberRoster(shares, roster) {
  const byUid = new Map();
  for (const m of roster) {
    if (m && typeof m === 'object' && typeof m.uid === 'string' && m.uid) {
      byUid.set(m.uid, m);
    }
  }
  return shares.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const ro = byUid.get(s.memberId);
    if (!ro || typeof ro.fixedAmount !== 'number' || !Number.isFinite(ro.fixedAmount)) return { ...s };
    const pct =
      typeof ro.percentage === 'number' && Number.isFinite(ro.percentage)
        ? Math.round(ro.percentage * 100) / 100
        : s.percent;
    return { ...s, amountCents: Math.round(ro.fixedAmount), percent: pct };
  });
}

/** After last invitee declines, owner roster may still have old per-person fixedAmount — bump to full total. */
function normalizeSoloOwnerMemberRoster(roster, totalCents, ownerUid) {
  if (!ownerUid || totalCents <= 0 || !Array.isArray(roster)) return roster;
  const active = roster.filter((m) => m && String(m.memberStatus ?? '').toLowerCase() === 'active');
  if (active.length !== 1) return roster;
  const sole = active[0];
  if (String(sole.uid ?? '') !== ownerUid) return roster;
  const sm = String(sole.splitMethod ?? 'equal').toLowerCase();
  if (sm === 'owner_less') return roster;
  return roster.map((m) => {
    if (!m || String(m.uid ?? '') !== ownerUid) return m;
    if (String(m.memberStatus ?? '').toLowerCase() !== 'active') return m;
    return { ...m, fixedAmount: Math.round(totalCents), percentage: 100 };
  });
}

function deriveOwnerUidFromShares(shares) {
  const row = shares.find((s) => s && s.role === 'owner');
  const mid = row && typeof row === 'object' ? row.memberId : undefined;
  return typeof mid === 'string' && mid ? mid : '';
}

function syncOwnerShareForPendingInvites(shares, totalCents, roster) {
  const list = shares.map((x) => ({ ...x }));
  if (hasInvitePendingInShares(list)) {
    const oi = list.findIndex((x) => x && x.role === 'owner');
    if (oi >= 0) {
      list[oi] = { ...list[oi], amountCents: Math.round(totalCents) };
    }
    return list;
  }
  if (roster && roster.length > 0) {
    const ownerUid = deriveOwnerUidFromShares(list);
    const rosterForApply =
      ownerUid && totalCents > 0
        ? normalizeSoloOwnerMemberRoster(roster.map((r) => ({ ...r })), totalCents, ownerUid)
        : roster;
    return applyPlannedAmountsFromMemberRoster(list, rosterForApply);
  }
  return list;
}

function getTotalCentsFromSubData(data) {
  const tc = data.totalCost;
  if (typeof tc === 'number' && Number.isFinite(tc)) return Math.round(tc);
  const t = data.totalCents;
  if (typeof t === 'number' && Number.isFinite(t)) return Math.round(t);
  return 0;
}

/** Mirrors client `parseBillingDayParam` monthly patterns (see `billingDayFormat.ts`). */
function parseBillingDayFromLabel(label) {
  if (typeof label !== 'string' || !label.trim()) return null;
  const t = label.trim();
  const everyMatch = t.match(/^every\s+(\d{1,2})(?:st|nd|th|rd)?$/i);
  if (everyMatch) {
    const day = parseInt(everyMatch[1], 10);
    if (day >= 1 && day <= 31) return day;
  }
  const monthlyMatch = t.match(/^(\d{1,2})(?:st|nd|th|rd)?\s+of\s+each\s+month$/i);
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1], 10);
    if (day >= 1 && day <= 31) return day;
  }
  const plain = t.match(/^(\d{1,2})$/);
  if (plain) {
    const day = parseInt(plain[1], 10);
    if (day >= 1 && day <= 31) return day;
  }
  return null;
}

/**
 * Option A: if billing day for this month is still in the future, first obligation is this cycle;
 * otherwise it starts next cycle.
 */
function computeFirstChargeObligationStartsNextCycle(subData) {
  const day = parseBillingDayFromLabel(subData?.billingDayLabel) ?? 1;
  const today = new Date();
  const billingDate = new Date(today.getFullYear(), today.getMonth(), day);
  const firstCycleIsThisMonth = billingDate > today;
  return !firstCycleIsThisMonth;
}

async function writeSplitInviteAcceptedActivities(db, subscriptionId, acceptedBy, createdBy, inviteId) {
  const subSnap = await db.collection('subscriptions').doc(subscriptionId).get();
  const sub = subSnap.data() || {};
  const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
  const row = shares.find((s) => s && s.memberId === acceptedBy);
  const shareCents = row && typeof row.amountCents === 'number' ? row.amountCents : 0;
  const subName = subscriptionLabelFromData(sub);
  const slugId = slugifyServiceIdFromName(subName);
  const ownerName = await getUserDisplayName(db, createdBy);
  const accepterName = await getUserDisplayName(db, acceptedBy);
  const accepterAvatarUrl = await getUserPhotoUrl(db, acceptedBy);
  try {
    await appendActivityEvent(db, acceptedBy, {
      type: 'split_invite_accepted',
      subscriptionId,
      subscriptionName: subName,
      serviceId: slugId,
      amount: shareCents,
      metadata: { ownerUid: createdBy, ownerName, inviteId },
    });
  } catch (e) {
    console.warn('writeSplitInviteAcceptedActivities: member', e?.message || e);
  }
  try {
    await appendActivityEvent(db, createdBy, {
      type: 'split_member_joined',
      subscriptionId,
      subscriptionName: subName,
      serviceId: slugId,
      actorUid: acceptedBy,
      actorName: accepterName,
      actorAvatarUrl: accepterAvatarUrl,
      metadata: { newMemberUid: acceptedBy, newMemberShare: shareCents, inviteId },
    });
  } catch (e) {
    console.warn('writeSplitInviteAcceptedActivities: owner', e?.message || e);
  }
}

async function mergeSplitInviteMember(db, subscriptionId, inviteId, acceptedBy) {
  const subRef = db.collection('subscriptions').doc(subscriptionId);
  const userRef = db.collection('users').doc(acceptedBy);
  await db.runTransaction(async (tx) => {
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists) return;
    const userSnap = await tx.get(userRef);
    const data = subSnap.data();
    const shares = Array.isArray(data.splitMemberShares) ? [...data.splitMemberShares] : [];
    const idx = shares.findIndex((s) => s && s.inviteId === inviteId);
    if (idx < 0) return;

    const oldShare = shares[idx];
    const oldMemberId = oldShare.memberId;
    const ud = userSnap.data() || {};
    const dn =
      typeof ud.displayName === 'string' && ud.displayName.trim() ? ud.displayName.trim() : 'Member';
    const parts = dn.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const init =
      parts.length >= 2
        ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
        : (parts[0] || '?').slice(0, 2).toUpperCase();

    shares[idx] = {
      ...oldShare,
      memberId: acceptedBy,
      displayName: dn,
      initials: init,
      invitePending: false,
      inviteId: admin.firestore.FieldValue.delete(),
      inviteExpiresAt: admin.firestore.FieldValue.delete(),
      pendingInviteEmail: admin.firestore.FieldValue.delete(),
    };

    let memberUids = Array.isArray(data.memberUids) ? [...data.memberUids] : [];
    memberUids = memberUids.map((u) => (u === oldMemberId ? acceptedBy : u));
    if (!memberUids.includes(acceptedBy)) memberUids.push(acceptedBy);

    const rawMembers = data.members;
    const firstM = Array.isArray(rawMembers) && rawMembers.length > 0 ? rawMembers[0] : undefined;
    const isObjectRoster =
      firstM !== undefined && typeof firstM === 'object' && firstM !== null;

    let membersRoster;
    if (isObjectRoster) {
      membersRoster = rawMembers.map((m) => (m && typeof m === 'object' ? { ...m } : {}));
      const mIdx = membersRoster.findIndex((m) => m && m.inviteId === inviteId);
      if (mIdx >= 0) {
        const obligationNext = computeFirstChargeObligationStartsNextCycle(data);
        membersRoster[mIdx] = {
          ...membersRoster[mIdx],
          uid: acceptedBy,
          memberStatus: 'active',
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentStatus: 'pending',
          firstChargeObligationStartsNextCycle: obligationNext,
          inviteId: admin.firestore.FieldValue.delete(),
          inviteExpiresAt: admin.firestore.FieldValue.delete(),
        };
      }
    } else {
      membersRoster = (Array.isArray(rawMembers) ? rawMembers : []).map((u) =>
        u === oldMemberId ? acceptedBy : u
      );
    }

    let activeMemberUids = Array.isArray(data.activeMemberUids) ? [...data.activeMemberUids] : [];
    if (!activeMemberUids.includes(acceptedBy)) activeMemberUids.push(acceptedBy);

    const mps = { ...(data.memberPaymentStatus || {}) };
    delete mps[oldMemberId];
    mps[acceptedBy] = 'pending';

    const totalCents =
      typeof data.totalCents === 'number' && Number.isFinite(data.totalCents) ? data.totalCents : 0;
    const syncedShares = isObjectRoster
      ? syncOwnerShareForPendingInvites(shares, totalCents, membersRoster)
      : shares;

    const updatePayload = {
      splitMemberShares: syncedShares,
      memberUids,
      memberPaymentStatus: mps,
      splitUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (isObjectRoster) {
      updatePayload.members = membersRoster;
      updatePayload.activeMemberUids = activeMemberUids;
    } else {
      updatePayload.members = membersRoster;
    }

    tx.update(subRef, updatePayload);
  });
}

/** Push to the split owner: "[Accepter] accepted your invite to [Subscription]". */
async function sendSplitInviteAcceptedNotification(db, ownerUid, subscriptionId, acceptedBy) {
  const subSnap = await db.collection('subscriptions').doc(subscriptionId).get();
  const sub = subSnap.data() || {};
  const serviceName = subscriptionLabelFromData(sub);
  const accepterDoc = await db.collection('users').doc(acceptedBy).get();
  const ad = accepterDoc.data() || {};
  const accepterName =
    typeof ad.displayName === 'string' && ad.displayName.trim() ? ad.displayName.trim() : 'Someone';

  const recipientDoc = await db.collection('users').doc(ownerUid).get();
  const prefs = recipientDoc.data()?.notificationPreferences;
  if (prefs && prefs.notificationsEnabled === false) return;

  const body = `${accepterName} accepted your invite to ${serviceName}`;

  const sessionsSnap = await db.collection('users').doc(ownerUid).collection('sessions').get();
  const tokens = new Set();
  sessionsSnap.docs.forEach((d) => {
    const t = d.data().fcmToken;
    if (typeof t === 'string' && t.trim()) tokens.add(t.trim());
  });

  await Promise.all(
    [...tokens].map((token) =>
      admin
        .messaging()
        .send({
          token,
          notification: { title: 'mySplit', body },
          data: {
            type: 'split_invite_accepted',
            subscriptionId,
            acceptedByUid: acceptedBy,
          },
        })
        .catch((e) => {
          console.warn('sendSplitInviteAcceptedNotification: FCM send failed', e?.message || e);
        })
    )
  );
}

/**
 * Removes pending invitee row from subscription (by inviteId). Owner share recalculates via
 * syncOwnerShareForPendingInvites. Appends splitInviteDeclineNotices for owner banner.
 */
async function removeDeclinedSplitInviteSlot(db, subscriptionId, inviteId, declinedByUid) {
  const subRef = db.collection('subscriptions').doc(subscriptionId);
  const declinerName = await getUserDisplayName(db, declinedByUid);
  await db.runTransaction(async (tx) => {
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists) return;
    const data = subSnap.data();
    const shares = Array.isArray(data.splitMemberShares) ? [...data.splitMemberShares] : [];
    const idx = shares.findIndex((s) => s && s.inviteId === inviteId);
    if (idx < 0) return;

    const oldShare = shares[idx];
    const oldMemberId = typeof oldShare.memberId === 'string' ? oldShare.memberId : '';
    shares.splice(idx, 1);

    const rawMembers = data.members;
    const firstM = Array.isArray(rawMembers) && rawMembers.length > 0 ? rawMembers[0] : undefined;
    const isObjectRoster =
      firstM !== undefined && typeof firstM === 'object' && firstM !== null;

    let membersRoster;
    if (isObjectRoster) {
      membersRoster = rawMembers.map((m) => (m && typeof m === 'object' ? { ...m } : {}));
      const mIdx = membersRoster.findIndex((m) => m && m.inviteId === inviteId);
      if (mIdx >= 0) membersRoster.splice(mIdx, 1);
    } else {
      membersRoster = Array.isArray(rawMembers) ? [...rawMembers] : [];
      const mIdx = membersRoster.findIndex((u) => u === oldMemberId);
      if (mIdx >= 0) membersRoster.splice(mIdx, 1);
    }

    let memberUids = Array.isArray(data.memberUids) ? [...data.memberUids] : [];
    memberUids = memberUids.filter((u) => u !== oldMemberId && u !== declinedByUid);

    let activeMemberUids = Array.isArray(data.activeMemberUids) ? [...data.activeMemberUids] : [];
    activeMemberUids = activeMemberUids.filter((u) => u !== oldMemberId && u !== declinedByUid);

    const mps = { ...(data.memberPaymentStatus || {}) };
    delete mps[oldMemberId];
    delete mps[declinedByUid];

    const totalCents = getTotalCentsFromSubData(data);
    const ownerUid = typeof data.ownerUid === 'string' ? data.ownerUid : '';
    if (isObjectRoster && Array.isArray(membersRoster) && membersRoster.length > 0 && ownerUid) {
      membersRoster = normalizeSoloOwnerMemberRoster(membersRoster, totalCents, ownerUid);
    }
    const syncedShares = isObjectRoster
      ? syncOwnerShareForPendingInvites(shares, totalCents, membersRoster)
      : shares;

    const rawNotices = data.splitInviteDeclineNotices;
    const existingNotices = Array.isArray(rawNotices) ? [...rawNotices] : [];
    existingNotices.push({
      declinerName,
      declinerUid: declinedByUid,
      inviteId,
      declinedAt: admin.firestore.Timestamp.now(),
    });
    const capped = existingNotices.slice(-20);

    const updatePayload = {
      splitMemberShares: syncedShares,
      memberUids,
      memberPaymentStatus: mps,
      splitUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      splitInviteDeclineNotices: capped,
    };
    if (isObjectRoster) {
      updatePayload.members = membersRoster;
      updatePayload.activeMemberUids = activeMemberUids;
    } else {
      updatePayload.members = membersRoster;
    }

    tx.update(subRef, updatePayload);
  });
}

async function sendSplitInviteDeclinedPushToOwner(
  db,
  ownerUid,
  subscriptionId,
  declinedByUid,
  declinerName,
  serviceName
) {
  const recipientDoc = await db.collection('users').doc(ownerUid).get();
  const prefs = recipientDoc.data()?.notificationPreferences;
  if (prefs && prefs.notificationsEnabled === false) return;

  const body = `${declinerName} declined your invite to ${serviceName}`;

  const sessionsSnap = await db.collection('users').doc(ownerUid).collection('sessions').get();
  const tokens = new Set();
  sessionsSnap.docs.forEach((d) => {
    const t = d.data().fcmToken;
    if (typeof t === 'string' && t.trim()) tokens.add(t.trim());
  });

  await Promise.all(
    [...tokens].map((token) =>
      admin
        .messaging()
        .send({
          token,
          notification: { title: 'mySplit', body },
          data: {
            type: 'split_invite_declined',
            subscriptionId,
            declinedByUid,
          },
        })
        .catch((e) => {
          console.warn('sendSplitInviteDeclinedPushToOwner: FCM send failed', e?.message || e);
        })
    )
  );
}

async function notifyOwnerSplitInviteDeclinedBell(
  db,
  ownerUid,
  subscriptionId,
  subscriptionName,
  declinerName,
  inviteId
) {
  const serviceIdSlug = slugifyServiceIdFromName(subscriptionName);
  try {
    await db
      .collection('users')
      .doc(ownerUid)
      .collection('notifications')
      .add({
        type: 'split_invite_declined_by_member',
        title: `${declinerName} declined your invite`,
        body: `${subscriptionName} · Invite someone else to fill this slot`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        deepLink: `/subscription/${subscriptionId}`,
        subscriptionId,
        serviceId: serviceIdSlug,
        metadata: {
          subscriptionId,
          subscriptionName,
          serviceId: serviceIdSlug,
          inviterUid: ownerUid,
          declinedMemberName: declinerName,
          inviteId,
        },
      });
    await incrementUnreadNotificationCount(db, ownerUid);
  } catch (e) {
    console.warn('notifyOwnerSplitInviteDeclinedBell', e?.message || e);
  }
}

/** FCM `data` fields must be strings. */
function stringifyFcmData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

/**
 * Sends a mySplit notification to all session tokens for `uid`. Respects `notificationPreferences`.
 * @param {{ title?: string }} [opts]
 */
async function sendMySplitPushToUser(db, uid, body, dataPayload, opts) {
  const recipientDoc = await db.collection('users').doc(uid).get();
  const prefs = recipientDoc.data()?.notificationPreferences;
  if (prefs && prefs.notificationsEnabled === false) return;

  const sessionsSnap = await db.collection('users').doc(uid).collection('sessions').get();
  const tokens = new Set();
  sessionsSnap.docs.forEach((d) => {
    const t = d.data().fcmToken;
    if (typeof t === 'string' && t.trim()) tokens.add(t.trim());
  });

  const data = stringifyFcmData(dataPayload);
  const title =
    opts && typeof opts.title === 'string' && opts.title.trim() ? opts.title.trim() : 'mySplit';

  await Promise.all(
    [...tokens].map((token) =>
      admin
        .messaging()
        .send({
          token,
          notification: { title, body },
          data,
        })
        .catch((e) => {
          console.warn('sendMySplitPushToUser: FCM send failed', e?.message || e);
        })
    )
  );
}

/** Real Firebase Auth uids only (skip invite-email-* placeholders). */
function isLikelyFirebaseUidForInvite(uid) {
  if (typeof uid !== 'string' || uid.length < 20) return false;
  if (uid.startsWith('invite-')) return false;
  return /^[a-zA-Z0-9]+$/.test(uid);
}

function invitedAtToMillis(invitedAt) {
  if (!invitedAt) return null;
  if (typeof invitedAt.toMillis === 'function') return invitedAt.toMillis();
  if (typeof invitedAt.seconds === 'number') return invitedAt.seconds * 1000;
  return null;
}

/**
 * Push + activity feed + bell for one pending invitee once `inviteId` exists on the share row.
 */
async function notifySplitInvitePendingMember(db, subId, after, memberUid, inviteId) {
  const ownerUid = after.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid || memberUid === ownerUid) return;
  if (!isLikelyFirebaseUidForInvite(memberUid)) return;
  if (typeof inviteId !== 'string' || !inviteId.trim()) return;

  const shares = Array.isArray(after.splitMemberShares) ? after.splitMemberShares : [];
  const row = shares.find((s) => s && s.memberId === memberUid);
  const memberShare = row && typeof row.amountCents === 'number' ? row.amountCents : 0;

  let memberPercentage;
  const roster = Array.isArray(after.members) ? after.members : [];
  const rm = roster.find((m) => m && typeof m === 'object' && m.uid === memberUid);
  if (rm && typeof rm.percentage === 'number' && Number.isFinite(rm.percentage)) {
    memberPercentage = rm.percentage;
  }

  const subscriptionName = subscriptionLabelFromData(after);
  const serviceIdSlug = slugifyServiceIdFromName(subscriptionName);

  const ownerDoc = await db.collection('users').doc(ownerUid).get();
  const od = ownerDoc.data() || {};
  const ownerName =
    typeof od.displayName === 'string' && od.displayName.trim() ? od.displayName.trim() : 'Someone';
  const ownerAvatarUrl = userPhotoUrlFromUserData(od);

  const pushTitle = `${ownerName} invited you to ${subscriptionName}`;
  const pushBody = `Your share would be $${(memberShare / 100).toFixed(2)}/month · Tap to accept or decline`;

  try {
    await sendMySplitPushToUser(
      db,
      memberUid,
      pushBody,
      {
        type: 'split_invite',
        subscriptionId: subId,
        inviteId,
      },
      { title: pushTitle }
    );
  } catch (e) {
    console.warn('notifySplitInvitePendingMember: push failed', memberUid, e?.message || e);
  }

  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await appendActivityEvent(db, memberUid, {
      type: 'split_invite_received',
      actorUid: ownerUid,
      actorName: ownerName,
      actorAvatarUrl: ownerAvatarUrl,
      subscriptionId: subId,
      subscriptionName,
      serviceId: serviceIdSlug,
      amount: memberShare,
      metadata: {
        inviterUid: ownerUid,
        inviteId,
        memberPercentage,
        expiresAt,
      },
    });
  } catch (e) {
    console.warn('notifySplitInvitePendingMember: activity failed', memberUid, e?.message || e);
  }

  try {
    await db
      .collection('users')
      .doc(memberUid)
      .collection('notifications')
      .add({
        type: 'split_invite',
        title: pushTitle,
        body: `Your share · $${(memberShare / 100).toFixed(2)}/month`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        deepLink: `/subscription/${subId}`,
        subscriptionId: subId,
        serviceId: serviceIdSlug,
        metadata: {
          inviterUid: ownerUid,
          inviteId,
          memberShare,
          memberPercentage,
          subscriptionId: subId,
          subscriptionName,
          serviceId: serviceIdSlug,
        },
      });
    await incrementUnreadNotificationCount(db, memberUid);
  } catch (e) {
    console.warn('notifySplitInvitePendingMember: notification doc failed', memberUid, e?.message || e);
  }

  const inviteeName =
    row && typeof row.displayName === 'string' && row.displayName.trim()
      ? row.displayName.trim()
      : await getUserDisplayName(db, memberUid);
  try {
    await appendActivityEvent(db, ownerUid, {
      type: 'split_invite_sent',
      subscriptionId: subId,
      subscriptionName,
      serviceId: serviceIdSlug,
      metadata: { inviteeUid: memberUid, inviteeName, userShareCents: memberShare, inviteId },
    });
  } catch (e) {
    console.warn('notifySplitInvitePendingMember: owner activity failed', e?.message || e);
  }
}

/**
 * When an invite moves to `accepted`, create `friendships/{uidSmall_uidLarge}` (Admin SDK; clients cannot write friendships).
 */
exports.onInviteAccepted = onDocumentUpdated('invites/{inviteId}', async (event) => {
  const beforeSnap = event.data.before;
  const afterSnap = event.data.after;
  if (!beforeSnap.exists || !afterSnap.exists) return;

  const before = beforeSnap.data();
  const after = afterSnap.data();

  if (before.status === 'accepted' || after.status !== 'accepted') return;

  const createdBy = after.createdBy;
  const acceptedBy = after.acceptedBy;
  if (typeof createdBy !== 'string' || typeof acceptedBy !== 'string' || createdBy === acceptedBy) {
    console.warn('onInviteAccepted: skip invalid acceptance', { inviteId: event.params.inviteId });
    return;
  }

  const [uidA, uidB] = sortedFriendshipUsers(createdBy, acceptedBy);
  const fid = friendshipDocId(createdBy, acceptedBy);
  const ref = admin.firestore().collection('friendships').doc(fid);

  const payload = {
    users: [uidA, uidB],
    connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    connectedVia: inferConnectedVia(after),
    initiatedBy: createdBy,
  };
  if (typeof after.splitId === 'string' && after.splitId.length > 0) {
    payload.splitId = after.splitId;
  }

  await admin.firestore().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists) return;
    tx.set(ref, payload);
  });

  const db = admin.firestore();
  const inviteId = event.params.inviteId;
  const splitId = typeof after.splitId === 'string' && after.splitId.length > 0 ? after.splitId : null;

  if (splitId) {
    try {
      await mergeSplitInviteMember(db, splitId, inviteId, acceptedBy);
    } catch (e) {
      console.warn('onInviteAccepted: mergeSplitInviteMember failed', e?.message || e);
    }
    try {
      await writeSplitInviteAcceptedActivities(db, splitId, acceptedBy, createdBy, inviteId);
    } catch (e) {
      console.warn('onInviteAccepted: writeSplitInviteAcceptedActivities failed', e?.message || e);
    }
    try {
      await sendSplitInviteAcceptedNotification(db, createdBy, splitId, acceptedBy);
    } catch (e) {
      console.warn('onInviteAccepted: sendSplitInviteAcceptedNotification failed', e?.message || e);
    }
  }
});

/**
 * Split invite declined: remove pending slot, notify owner, write activity feeds.
 * Decliner activity is written here when using inviteId path; skip duplicate from notification trigger.
 */
exports.onInviteDeclined = onDocumentUpdated('invites/{inviteId}', async (event) => {
  const beforeSnap = event.data.before;
  const afterSnap = event.data.after;
  if (!beforeSnap.exists || !afterSnap.exists) return;

  const before = beforeSnap.data();
  const after = afterSnap.data();

  if (before.status === 'declined' || after.status !== 'declined') return;

  const declinedBy = after.declinedBy;
  const createdBy = after.createdBy;
  const inviteId = event.params.inviteId;
  const splitId = typeof after.splitId === 'string' && after.splitId.length > 0 ? after.splitId : null;

  if (!splitId || typeof declinedBy !== 'string' || typeof createdBy !== 'string') return;

  const db = admin.firestore();

  try {
    await removeDeclinedSplitInviteSlot(db, splitId, inviteId, declinedBy);
  } catch (e) {
    console.warn('onInviteDeclined: removeDeclinedSplitInviteSlot failed', e?.message || e);
  }

  const declinerName = await getUserDisplayName(db, declinedBy);
  const subSnap = await db.collection('subscriptions').doc(splitId).get();
  const sub = subSnap.data() || {};
  const subName = subscriptionLabelFromData(sub);
  const slugId = slugifyServiceIdFromName(subName);
  const ownerName = await getUserDisplayName(db, createdBy);

  try {
    await appendActivityEvent(db, declinedBy, {
      type: 'split_invite_declined',
      subscriptionId: splitId,
      subscriptionName: subName,
      serviceId: slugId,
      actorUid: createdBy,
      actorName: ownerName,
      metadata: { inviterUid: createdBy, inviteId },
    });
  } catch (e) {
    console.warn('onInviteDeclined: decliner activity', e?.message || e);
  }

  try {
    await appendActivityEvent(db, createdBy, {
      type: 'split_invite_declined_owner',
      subscriptionId: splitId,
      subscriptionName: subName,
      serviceId: slugId,
      actorUid: declinedBy,
      actorName: declinerName,
      metadata: { inviteId, declinerUid: declinedBy },
    });
  } catch (e) {
    console.warn('onInviteDeclined: owner activity', e?.message || e);
  }

  try {
    await sendSplitInviteDeclinedPushToOwner(db, createdBy, splitId, declinedBy, declinerName, subName);
  } catch (e) {
    console.warn('onInviteDeclined: push failed', e?.message || e);
  }

  try {
    await notifyOwnerSplitInviteDeclinedBell(db, createdBy, splitId, subName, declinerName, inviteId);
  } catch (e) {
    console.warn('onInviteDeclined: bell failed', e?.message || e);
  }
});

/**
 * Push + in-app notification for the non-initiator when a friendship is created from Find People.
 */
exports.onFriendshipCreatedNotify = onDocumentCreated('friendships/{friendshipId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const via = data.connectedVia;
  if (via !== 'search' && via !== 'user_search' && via !== 'contacts') return;

  const users = data.users;
  const initiatedBy = data.initiatedBy;
  if (!Array.isArray(users) || users.length !== 2) return;
  if (typeof initiatedBy !== 'string') return;

  const recipientUid = users[0] === initiatedBy ? users[1] : users[0];
  if (!recipientUid || recipientUid === initiatedBy) return;

  const db = admin.firestore();
  const senderDoc = await db.collection('users').doc(initiatedBy).get();
  const sd = senderDoc.data() || {};
  const senderName =
    typeof sd.displayName === 'string' && sd.displayName.trim() ? sd.displayName.trim() : 'Someone';
  const emailNorm = typeof sd.emailNormalized === 'string' ? sd.emailNormalized : '';
  const friendUsername = usernameFromEmailNormalized(emailNorm).replace(/^@/, '');

  try {
    await db.collection('users').doc(recipientUid).collection('notifications').add({
      type: 'friend_connected',
      title: `${senderName} connected with you`,
      body: 'You can now split subscriptions together',
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      deepLink: `/friends/${initiatedBy}`,
      metadata: {
        friendUid: initiatedBy,
        friendName: senderName,
        friendAvatarUrl: typeof sd.avatarUrl === 'string' ? sd.avatarUrl : null,
        friendUsername,
      },
    });
    await incrementUnreadNotificationCount(db, recipientUid);
  } catch (e) {
    console.warn('onFriendshipCreatedNotify: in-app notification failed', e?.message || e);
  }

  const recipientDoc = await db.collection('users').doc(recipientUid).get();
  const prefs = recipientDoc.data()?.notificationPreferences;
  if (prefs && prefs.notificationsEnabled === false) return;

  const body = `${senderName} connected with you on mySplit`;

  const sessionsSnap = await db.collection('users').doc(recipientUid).collection('sessions').get();
  const tokens = new Set();
  sessionsSnap.docs.forEach((d) => {
    const t = d.data().fcmToken;
    if (typeof t === 'string' && t.trim()) tokens.add(t.trim());
  });

  await Promise.all(
    [...tokens].map((token) =>
      admin
        .messaging()
        .send({
          token,
          notification: { title: 'mySplit', body },
          data: { type: 'friend_connected', initiatorUid: initiatedBy },
        })
        .catch((e) => {
          console.warn('onFriendshipCreatedNotify: FCM send failed', e?.message || e);
        })
    )
  );
});

/**
 * Activity feed: friend_connected (non-initiator) + friend_invite_accepted (initiator on invite flows).
 */
exports.onFriendshipCreatedActivityFeed = onDocumentCreated('friendships/{friendshipId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const users = data.users;
  const initiatedBy = data.initiatedBy;
  if (!Array.isArray(users) || users.length !== 2 || typeof initiatedBy !== 'string' || !initiatedBy) return;
  const otherUid = users[0] === initiatedBy ? users[1] : users[0];
  if (!otherUid || otherUid === initiatedBy) return;

  const db = admin.firestore();
  const initiatorDoc = await db.collection('users').doc(initiatedBy).get();
  const otherDoc = await db.collection('users').doc(otherUid).get();
  const id = initiatorDoc.data() || {};
  const od = otherDoc.data() || {};
  const initiatorName =
    typeof id.displayName === 'string' && id.displayName.trim() ? id.displayName.trim() : 'Someone';
  const otherName =
    typeof od.displayName === 'string' && od.displayName.trim() ? od.displayName.trim() : 'Someone';
  const initiatorAvatar = typeof id.avatarUrl === 'string' ? id.avatarUrl : null;
  const otherAvatar = typeof od.avatarUrl === 'string' ? od.avatarUrl : null;
  const emailNormInit = typeof id.emailNormalized === 'string' ? id.emailNormalized : '';
  const unameAt = usernameFromEmailNormalized(emailNormInit);
  const friendUsernamePlain = unameAt.startsWith('@') ? unameAt.slice(1) : unameAt;

  const via = normalizeActivityConnectedVia(data.connectedVia);

  try {
    await appendActivityEvent(db, otherUid, {
      type: 'friend_connected',
      actorUid: initiatedBy,
      actorName: initiatorName,
      actorAvatarUrl: initiatorAvatar,
      metadata: {
        friendUid: initiatedBy,
        friendUsername: friendUsernamePlain,
        connectedVia: via,
      },
    });
  } catch (e) {
    console.warn('onFriendshipCreatedActivityFeed: friend_connected failed', e?.message || e);
  }

  const rawVia = data.connectedVia;
  if (rawVia === 'direct_invite' || rawVia === 'split_invite') {
    try {
      await appendActivityEvent(db, initiatedBy, {
        type: 'friend_invite_accepted',
        actorUid: otherUid,
        actorName: otherName,
        actorAvatarUrl: otherAvatar,
        metadata: { friendUid: otherUid },
      });
    } catch (e) {
      console.warn('onFriendshipCreatedActivityFeed: friend_invite_accepted failed', e?.message || e);
    }
  }
});

/**
 * New subscription docs (wizard create) only fire `onDocumentCreated`, not `onDocumentUpdated`.
 * Split-invite push / activity / bell are sent from {@link exports.onSubscriptionSplitInviteNotifications}
 * after the client attaches `inviteId` to each pending share row.
 */
exports.onSubscriptionCreatedSplitInviteInAppNotify = onDocumentCreated(
  'subscriptions/{subscriptionId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const after = snap.data();
    const subId = event.params.subscriptionId;
    const db = admin.firestore();
    if (after.autoCharge === true) {
      try {
        await writeAutoChargeActivity(db, subId, after, true);
      } catch (e) {
        console.warn('onSubscriptionCreated: auto_charge activity', e?.message || e);
      }
    }
  }
);

/**
 * When `splitMemberShares` gains or changes `inviteId` on an invite-pending row, notify that member
 * (push + activity + bell). Runs after `attachSplitInvitesToSubscription`; also covers resend (new inviteId).
 */
exports.onSubscriptionSplitInviteNotifications = onDocumentUpdated('subscriptions/{subscriptionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;
  const ownerUid = after.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid) return;
  const subId = event.params.subscriptionId;

  const beforeShares = Array.isArray(before.splitMemberShares) ? before.splitMemberShares : [];
  const afterShares = Array.isArray(after.splitMemberShares) ? after.splitMemberShares : [];
  const db = admin.firestore();

  for (const share of afterShares) {
    if (!share || share.role === 'owner' || !share.invitePending) continue;
    const mid = typeof share.memberId === 'string' ? share.memberId : '';
    if (!mid || mid === ownerUid) continue;
    if (!isLikelyFirebaseUidForInvite(mid)) continue;
    const inviteId = typeof share.inviteId === 'string' ? share.inviteId : '';
    if (!inviteId) continue;

    const prev = beforeShares.find((s) => s && s.memberId === mid);
    const prevInviteId = prev && typeof prev.inviteId === 'string' ? prev.inviteId : '';
    if (prevInviteId === inviteId) continue;

    try {
      await notifySplitInvitePendingMember(db, subId, after, mid, inviteId);
    } catch (e) {
      console.warn('onSubscriptionSplitInviteNotifications: failed', mid, e?.message || e);
    }
  }
});

/**
 * When the owner removes a pending invite, a slot expires to `expired`, or the owner ends the split,
 * invalidate the invitee's bell notification + activity row so stale Join/Decline UI disappears.
 */
function subscriptionLooksEnded(data) {
  if (!data || typeof data !== 'object') return false;
  const s = data.status;
  return s === 'ended' || s === 'archived' || s === 'cancelled' || s === 'paused';
}

function findSplitInviteInvalidationTargets(before, after) {
  const targets = [];
  const seen = new Set();
  const beforeShares = Array.isArray(before.splitMemberShares) ? before.splitMemberShares : [];
  const afterMemberUids = new Set(Array.isArray(after.memberUids) ? after.memberUids : []);

  /* Ending the split updates `status` only; pending invitees stay in `memberUids` until cleaned up. */
  if (subscriptionLooksEnded(after) && !subscriptionLooksEnded(before)) {
    const afterShares = Array.isArray(after.splitMemberShares) ? after.splitMemberShares : [];
    for (const s of afterShares) {
      if (!s || !s.invitePending) continue;
      const mid = typeof s.memberId === 'string' ? s.memberId : '';
      const iid = typeof s.inviteId === 'string' ? s.inviteId : '';
      if (!mid || !iid) continue;
      if (!isLikelyFirebaseUidForInvite(mid)) continue;
      const key = `${mid}_${iid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ uid: mid, inviteId: iid });
    }
  }

  for (const s of beforeShares) {
    if (!s || !s.invitePending) continue;
    const mid = typeof s.memberId === 'string' ? s.memberId : '';
    const iid = typeof s.inviteId === 'string' ? s.inviteId : '';
    if (!mid || !iid) continue;
    if (!isLikelyFirebaseUidForInvite(mid)) continue;
    if (!afterMemberUids.has(mid)) {
      const key = `${mid}_${iid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ uid: mid, inviteId: iid });
    }
  }

  const bR = Array.isArray(before.members) && before.members[0] && typeof before.members[0] === 'object' ? before.members : [];
  const aR = Array.isArray(after.members) && after.members[0] && typeof after.members[0] === 'object' ? after.members : [];
  for (const bm of bR) {
    if (!bm || bm.memberStatus !== 'pending') continue;
    const uid = typeof bm.uid === 'string' ? bm.uid : '';
    if (!uid || !isLikelyFirebaseUidForInvite(uid)) continue;
    const am = aR.find((m) => m && m.uid === uid);
    if (!am || am.memberStatus !== 'expired') continue;
    const shareRow = beforeShares.find((x) => x && x.memberId === uid);
    const iid =
      (shareRow && typeof shareRow.inviteId === 'string' && shareRow.inviteId) ||
      (typeof bm.inviteId === 'string' ? bm.inviteId : '');
    if (!iid) continue;
    const key = `${uid}_${iid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ uid, inviteId: iid });
  }

  return targets;
}

async function invalidateSplitInviteForInvitee(db, subId, inviteeUid, inviteId) {
  if (typeof inviteeUid !== 'string' || !inviteeUid) return;

  let unreadDec = 0;
  const notifCol = db.collection('users').doc(inviteeUid).collection('notifications');
  const notifSnap = await notifCol.where('subscriptionId', '==', subId).where('type', '==', 'split_invite').get();

  for (const doc of notifSnap.docs) {
    const d = doc.data() || {};
    const meta = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
    const metaInvite =
      typeof meta.inviteId === 'string' && meta.inviteId.trim() ? meta.inviteId.trim() : '';
    if (inviteId && metaInvite && metaInvite !== inviteId) continue;
    if (d.status === 'cancelled') continue;
    if (d.read !== true) unreadDec += 1;
    await doc.ref.update({
      status: 'cancelled',
      read: true,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const actCol = db.collection('users').doc(inviteeUid).collection('activity');
  const actSnap = await actCol.where('subscriptionId', '==', subId).where('type', '==', 'split_invite_received').get();

  for (const doc of actSnap.docs) {
    const d = doc.data() || {};
    const meta = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
    const metaInvite =
      typeof meta.inviteId === 'string' && meta.inviteId.trim() ? meta.inviteId.trim() : '';
    if (inviteId && metaInvite && metaInvite !== inviteId) continue;
    if (d.status === 'cancelled') continue;
    await doc.ref.update({
      status: 'cancelled',
      read: true,
    });
  }

  if (unreadDec > 0) {
    await db.collection('users').doc(inviteeUid).set(
      { unreadNotificationCount: admin.firestore.FieldValue.increment(-unreadDec) },
      { merge: true }
    );
  }
}

exports.onInviteRemoved = onDocumentUpdated('subscriptions/{subscriptionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!before || !after) return;

  const subId = event.params.subscriptionId;
  const targets = findSplitInviteInvalidationTargets(before, after);
  if (targets.length === 0) return;

  const db = admin.firestore();
  for (const t of targets) {
    try {
      await invalidateSplitInviteForInvitee(db, subId, t.uid, t.inviteId);
    } catch (e) {
      console.warn('onInviteRemoved: failed for', t.uid, e?.message || e);
    }
  }
});

/**
 * Payment activity: pending → paid on `memberPaymentStatus` writes `payment_received` (owner) and
 * `payment_sent` (member who paid).
 */
exports.onSubscriptionMemberPaymentActivity = onDocumentUpdated('subscriptions/{subscriptionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;
  const beforeMps = before.memberPaymentStatus || {};
  const afterMps = after.memberPaymentStatus || {};
  const ownerUid = after.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid) return;
  const subId = event.params.subscriptionId;
  const shares = Array.isArray(after.splitMemberShares) ? after.splitMemberShares : [];
  const subName = subscriptionLabelFromData(after);
  const serviceId = slugifyServiceIdFromName(subName);
  const cycleMonth = formatCycleMonthLabel(admin.firestore.Timestamp.now());

  const db = admin.firestore();
  const memberIds = new Set([...Object.keys(beforeMps), ...Object.keys(afterMps)]);
  for (const memberUid of memberIds) {
    const prev = beforeMps[memberUid];
    const next = afterMps[memberUid];
    if (prev === next) continue;
    if (next !== 'paid') continue;
    if (prev !== 'pending') continue;

    const share = shares.find((s) => s && s.memberId === memberUid);
    const amountCents = share && typeof share.amountCents === 'number' ? share.amountCents : 0;
    const actorName = await getUserDisplayName(db, memberUid);

    if (memberUid !== ownerUid) {
      await appendActivityEvent(db, ownerUid, {
        type: 'payment_received',
        subscriptionId: subId,
        subscriptionName: subName,
        serviceId,
        actorUid: memberUid,
        actorName,
        amount: amountCents,
        metadata: { memberUid, cycleMonth },
      });
    }

    await appendActivityEvent(db, memberUid, {
      type: 'payment_sent',
      subscriptionId: subId,
      subscriptionName: subName,
      serviceId,
      amount: amountCents,
      metadata: {
        ownerUid,
        ownerName: await getUserDisplayName(db, ownerUid),
        cycleMonth,
      },
    });
  }
});

/**
 * Auto-charge toggled → activity on every member’s feed (owner is actor).
 */
exports.onSubscriptionAutoChargeActivity = onDocumentUpdated('subscriptions/{subscriptionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;
  const prevOn = before.autoCharge === true;
  const nextOn = after.autoCharge === true;
  if (prevOn === nextOn) return;
  const subId = event.params.subscriptionId;
  const db = admin.firestore();
  try {
    await writeAutoChargeActivity(db, subId, after, nextOn);
  } catch (e) {
    console.warn('onSubscriptionAutoChargeActivity', e?.message || e);
  }
});

/**
 * When a split is ended (`status` → `ended`), write `split_ended` to every member’s activity feed.
 */
exports.onSubscriptionEndedActivity = onDocumentUpdated('subscriptions/{subscriptionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;
  const prev = before.status;
  const next = after.status;
  if (next !== 'ended' || prev === 'ended') return;

  const endedBy = after.endedBy;
  if (typeof endedBy !== 'string' || !endedBy) return;

  const subId = event.params.subscriptionId;
  const subName = subscriptionLabelFromData(after);
  const serviceId = slugifyServiceIdFromName(subName);

  const ownerUid = after.ownerUid;
  const memberUids = Array.isArray(after.memberUids) ? after.memberUids : [];
  const uids = new Set(
    [...memberUids, typeof ownerUid === 'string' ? ownerUid : null].filter(
      (u) => typeof u === 'string' && u
    )
  );

  const db = admin.firestore();
  const actorName = await getUserDisplayName(db, endedBy);
  for (const uid of uids) {
    try {
      await appendActivityEvent(db, uid, {
        type: 'split_ended',
        subscriptionId: subId,
        subscriptionName: subName,
        serviceId,
        actorUid: endedBy,
        actorName,
        metadata: {
          subscriptionId: subId,
          endedByOwner: typeof ownerUid === 'string' && endedBy === ownerUid,
        },
      });
    } catch (e) {
      console.warn('onSubscriptionEndedActivity: failed for', uid, e?.message || e);
    }
  }
});

/**
 * When a subscription is deleted or becomes `ended`, mark related activity feed rows so clients can filter.
 * Writes `subscriptionDeleted: true` on `users/{uid}/activity` for matching `subscriptionId`.
 */
exports.onSubscriptionEndedOrDeletedMarkActivity = onDocumentWritten(
  'subscriptions/{subscriptionId}',
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const subId = event.params.subscriptionId;

    const isDeleted = !after;
    const becameEnded =
      after &&
      String(after.status ?? '') === 'ended' &&
      (!before || String(before.status ?? '') !== 'ended');

    if (!isDeleted && !becameEnded) return;

    const dataForMembers = after || before;
    if (!dataForMembers || typeof dataForMembers !== 'object') return;

    const uids = new Set();
    const ownerUid = dataForMembers.ownerUid;
    if (typeof ownerUid === 'string' && ownerUid) uids.add(ownerUid);
    const mu = dataForMembers.memberUids;
    if (Array.isArray(mu)) {
      for (const u of mu) {
        if (typeof u === 'string' && u) uids.add(u);
      }
    }

    const db = admin.firestore();
    for (const uid of uids) {
      try {
        const activityQuery = await db
          .collection('users')
          .doc(uid)
          .collection('activity')
          .where('subscriptionId', '==', subId)
          .get();

        const docs = activityQuery.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = db.batch();
          for (const d of docs.slice(i, i + 400)) {
            batch.update(d.ref, { subscriptionDeleted: true });
          }
          await batch.commit();
        }
      } catch (e) {
        console.warn('onSubscriptionEndedOrDeletedMarkActivity', uid, e?.message || e);
      }
    }
  }
);

function subscriptionTotalCents(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.totalCents === 'number') return data.totalCents;
  if (typeof data.amountCents === 'number') return data.amountCents;
  return null;
}

function buildSharePercentChanges(bShares, aShares) {
  const changes = [];
  for (const a of aShares) {
    if (!a || typeof a !== 'object') continue;
    const uid = a.memberId;
    if (!uid) continue;
    const b = bShares.find((s) => s && s.memberId === uid);
    const oldPct = typeof b?.percent === 'number' ? b.percent : null;
    const newPct = typeof a.percent === 'number' ? a.percent : null;
    const oldAmt = typeof b?.amountCents === 'number' ? b.amountCents : null;
    const newAmt = typeof a.amountCents === 'number' ? a.amountCents : null;
    const name = typeof a.displayName === 'string' && a.displayName.trim() ? a.displayName.trim() : 'Member';
    if (oldPct != null && newPct != null && oldPct !== newPct) {
      changes.push({ memberName: name, memberId: uid, oldPct, newPct });
    } else if (oldAmt != null && newAmt != null && oldAmt !== newAmt) {
      changes.push({
        memberName: name,
        memberId: uid,
        oldPct: oldPct ?? 0,
        newPct: newPct ?? 0,
        oldAmountCents: oldAmt,
        newAmountCents: newAmt,
      });
    }
  }
  return changes;
}

/**
 * Decline split invite (notification marked declined) → activity on that user’s feed.
 */
exports.onNotificationSplitInviteDeclinedActivity = onDocumentUpdated(
  'users/{userId}/notifications/{notificationId}',
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.data();
    if (!after || after.type !== 'split_invite') return;
    if (after.actioned !== 'declined') return;
    if (before.actioned === 'declined') return;

    const userId = event.params.userId;
    const m = after.metadata || {};
    /* Invite doc decline + onInviteDeclined already wrote split_invite_declined for the decliner. */
    if (typeof m.inviteId === 'string' && m.inviteId.trim()) return;

    const subscriptionId = typeof m.subscriptionId === 'string' ? m.subscriptionId : '';
    const subscriptionName =
      typeof m.subscriptionName === 'string' && m.subscriptionName.trim()
        ? m.subscriptionName.trim()
        : 'Subscription';
    const inviterUid = typeof m.inviterUid === 'string' ? m.inviterUid : '';
    const inviterName =
      typeof m.inviterName === 'string' && m.inviterName.trim() ? m.inviterName.trim() : 'Someone';
    const slugId = slugifyServiceIdFromName(subscriptionName);

    const db = admin.firestore();
    try {
      await appendActivityEvent(db, userId, {
        type: 'split_invite_declined',
        subscriptionId,
        subscriptionName,
        serviceId: slugId,
        actorUid: inviterUid || undefined,
        actorName: inviterName,
        metadata: { inviterUid },
      });
    } catch (e) {
      console.warn('onNotificationSplitInviteDeclinedActivity', e?.message || e);
    }
  }
);

/**
 * Member removed, invite accepted, price change, split edit (percent/amount).
 */
exports.onSubscriptionSplitLifecycleActivity = onDocumentUpdated('subscriptions/{subscriptionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;
  const subId = event.params.subscriptionId;
  const ownerUid = after.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid) return;

  const subName = subscriptionLabelFromData(after);
  const slugId = slugifyServiceIdFromName(subName);
  const db = admin.firestore();

  const bShares = Array.isArray(before.splitMemberShares) ? before.splitMemberShares : [];
  const aShares = Array.isArray(after.splitMemberShares) ? after.splitMemberShares : [];
  const bMps = before.memberPaymentStatus || {};
  const aMps = after.memberPaymentStatus || {};

  const bUids = new Set(Array.isArray(before.memberUids) ? before.memberUids : []);
  const aUids = new Set(Array.isArray(after.memberUids) ? after.memberUids : []);
  const allMemberUids = new Set([...aUids, ownerUid].filter((u) => typeof u === 'string' && u));

  const voluntaryLeaveUid =
    typeof after.leaveVoluntaryUid === 'string' && after.leaveVoluntaryUid.trim()
      ? after.leaveVoluntaryUid.trim()
      : null;
  const voluntaryHandled = new Set();

  for (const rid of bUids) {
    if (aUids.has(rid)) continue;
    if (typeof rid !== 'string' || !rid) continue;
    const bShare = bShares.find((s) => s && s.memberId === rid);
    const removedName =
      typeof bShare?.displayName === 'string' && bShare.displayName.trim()
        ? bShare.displayName.trim()
        : await getUserDisplayName(db, rid);

    if (voluntaryLeaveUid && rid === voluntaryLeaveUid) {
      voluntaryHandled.add(rid);
      const leftMemberAvatarUrl = await getUserPhotoUrl(db, rid);
      try {
        await appendActivityEvent(db, rid, {
          type: 'split_left',
          subscriptionId: subId,
          subscriptionName: subName,
          serviceId: slugId,
          metadata: {},
        });
      } catch (e) {
        console.warn('split_left', rid, e?.message || e);
      }
      try {
        await appendActivityEvent(db, ownerUid, {
          type: 'split_member_left',
          subscriptionId: subId,
          subscriptionName: subName,
          serviceId: slugId,
          actorUid: rid,
          actorName: removedName,
          actorAvatarUrl: leftMemberAvatarUrl,
          metadata: { leftMemberUid: rid },
        });
      } catch (e) {
        console.warn('split_member_left', ownerUid, e?.message || e);
      }
      const pushBody = `${removedName} left your ${subName} split`;
      try {
        await sendMySplitPushToUser(
          db,
          ownerUid,
          pushBody,
          { type: 'split_member_left', subscriptionId: subId },
          { title: 'mySplit' }
        );
      } catch (e) {
        console.warn('leave split push', e?.message || e);
      }
      continue;
    }

    for (const target of [ownerUid, rid]) {
      try {
        await appendActivityEvent(db, target, {
          type: 'split_member_removed',
          subscriptionId: subId,
          subscriptionName: subName,
          serviceId: slugId,
          actorUid: rid,
          actorName: removedName,
          metadata: { removedMemberUid: rid },
        });
      } catch (e) {
        console.warn('split_member_removed', target, e?.message || e);
      }
    }
  }

  if (voluntaryLeaveUid && voluntaryHandled.has(voluntaryLeaveUid)) {
    try {
      await db.collection('subscriptions').doc(subId).update({
        leaveVoluntaryUid: admin.firestore.FieldValue.delete(),
      });
    } catch (e) {
      console.warn('clear leaveVoluntaryUid', e?.message || e);
    }
  }

  /* split_invite_accepted / split_member_joined are written in onInviteAccepted after merge
   * (subscription diff cannot reliably match when pending share memberId changes to accepter). */

  const beforePc = before.priceChangedAt;
  const afterPc = after.priceChangedAt;
  let priceChanged = false;
  if (afterPc && typeof afterPc.toMillis === 'function') {
    if (!beforePc || typeof beforePc.toMillis !== 'function') priceChanged = true;
    else if (beforePc.toMillis() !== afterPc.toMillis()) priceChanged = true;
  }
  if (priceChanged) {
    const oldPrice =
      typeof after.priceChangeFromCents === 'number'
        ? after.priceChangeFromCents
        : subscriptionTotalCents(before);
    const newPrice =
      typeof after.priceChangeToCents === 'number'
        ? after.priceChangeToCents
        : subscriptionTotalCents(after);
    const actorUid =
      typeof after.priceLastChangedByUid === 'string' && after.priceLastChangedByUid
        ? after.priceLastChangedByUid
        : ownerUid;
    const actorName = await getUserDisplayName(db, actorUid);
    for (const uid of allMemberUids) {
      try {
        await appendActivityEvent(db, uid, {
          type: 'split_price_updated',
          subscriptionId: subId,
          subscriptionName: subName,
          serviceId: slugId,
          actorUid,
          actorName,
          metadata: {
            oldPrice: oldPrice ?? 0,
            newPrice: newPrice ?? 0,
          },
        });
      } catch (e) {
        console.warn('split_price_updated', e?.message || e);
      }
    }
  }

  if (priceChanged) return;

  const editedBy = after.splitLastEditedByUid;
  if (typeof editedBy !== 'string' || !editedBy) return;

  const tb = subscriptionTotalCents(before);
  const ta = subscriptionTotalCents(after);
  if (tb != null && ta != null && tb !== ta) return;

  const changes = buildSharePercentChanges(bShares, aShares);
  if (changes.length === 0) return;

  const actorName = await getUserDisplayName(db, editedBy);
  for (const uid of allMemberUids) {
    try {
      await appendActivityEvent(db, uid, {
        type: 'split_percentage_updated',
        subscriptionId: subId,
        subscriptionName: subName,
        serviceId: slugId,
        actorUid: editedBy,
        actorName,
        metadata: { changes },
      });
    } catch (e) {
      console.warn('split_percentage_updated', e?.message || e);
    }
  }
});

/**
 * Pending payment_intents past due_date (UTC): `payment_overdue` on the subscription owner's feed.
 */
exports.scanOverduePaymentIntents = onSchedule('every day 04:00', async () => {
  const db = admin.firestore();
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayStartTs = admin.firestore.Timestamp.fromDate(todayStart);

  const snap = await db
    .collection('payment_intents')
    .where('status', '==', 'pending')
    .where('due_date', '<', todayStartTs)
    .limit(500)
    .get();

  for (const doc of snap.docs) {
    const d = doc.data();
    const subscriptionId = d.subscriptionId;
    const payer = d.payer;
    const recipient = d.recipient;
    const amountCents = typeof d.amountCents === 'number' ? d.amountCents : 0;
    if (typeof subscriptionId !== 'string' || typeof payer !== 'string' || typeof recipient !== 'string') continue;

    const docId = `overdue_${doc.id}`;
    const ref = db.collection('users').doc(recipient).collection('activity').doc(docId);
    const existing = await ref.get();
    if (existing.exists) continue;

    const subSnap = await db.collection('subscriptions').doc(subscriptionId).get();
    if (!subSnap.exists) continue;
    const sub = subSnap.data();
    const subName = subscriptionLabelFromData(sub);
    const serviceId = slugifyServiceIdFromName(subName);
    const due = d.due_date;
    let daysOverdue = 1;
    if (due && typeof due.toDate === 'function') {
      const ms = todayStart.getTime() - due.toDate().getTime();
      daysOverdue = Math.max(1, Math.floor(ms / 86400000));
    }

    const actorName = await getUserDisplayName(db, payer);
    await ref.set({
      type: 'payment_overdue',
      subscriptionId,
      subscriptionName: subName,
      serviceId,
      actorUid: payer,
      actorName,
      amount: amountCents,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: { daysOverdue, paymentIntentId: doc.id },
    });
  }
});

/**
 * Owner sends a payment reminder to a member: `reminder_sent` (owner) + `reminder_received` (member).
 *
 * Input: `{ subscriptionId: string, memberUid: string }`
 */
exports.sendPaymentReminder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const senderUid = request.auth.uid;
  const subscriptionId = request.data?.subscriptionId;
  const memberUid = request.data?.memberUid;
  if (typeof subscriptionId !== 'string' || !subscriptionId.trim()) {
    throw new HttpsError('invalid-argument', 'subscriptionId required.');
  }
  if (typeof memberUid !== 'string' || !memberUid.trim()) {
    throw new HttpsError('invalid-argument', 'memberUid required.');
  }

  const db = admin.firestore();
  const subSnap = await db.collection('subscriptions').doc(subscriptionId.trim()).get();
  if (!subSnap.exists) {
    throw new HttpsError('not-found', 'Subscription not found.');
  }
  const sub = subSnap.data();
  const ownerUid = sub.ownerUid;
  if (senderUid !== ownerUid) {
    throw new HttpsError('permission-denied', 'Only the split owner can send reminders.');
  }
  if (memberUid === ownerUid) {
    throw new HttpsError('invalid-argument', 'Invalid member.');
  }
  const memberUids = Array.isArray(sub.memberUids) ? sub.memberUids : [];
  if (!memberUids.includes(memberUid)) {
    throw new HttpsError('invalid-argument', 'Member is not on this split.');
  }

  const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
  const share = shares.find((s) => s && s.memberId === memberUid);
  const amountCents = share && typeof share.amountCents === 'number' ? share.amountCents : 0;
  const subName = subscriptionLabelFromData(sub);
  const serviceId = slugifyServiceIdFromName(subName);
  const targetName = await getUserDisplayName(db, memberUid);
  const senderName = await getUserDisplayName(db, senderUid);

  await appendActivityEvent(db, senderUid, {
    type: 'reminder_sent',
    subscriptionId: subscriptionId.trim(),
    subscriptionName: subName,
    serviceId,
    actorUid: memberUid,
    actorName: targetName,
    amount: amountCents,
  });

  await appendActivityEvent(db, memberUid, {
    type: 'reminder_received',
    subscriptionId: subscriptionId.trim(),
    subscriptionName: subName,
    serviceId,
    actorUid: senderUid,
    actorName: senderName,
    amount: amountCents,
  });

  return { ok: true };
});

/**
 * Marks pending invites past `expiresAt` as `expired`. Runs daily; processes in chunks of 500.
 */
exports.expireInvites = onSchedule('every day 03:00', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  while (true) {
    const snap = await db
      .collection('invites')
      .where('status', '==', 'pending')
      .where('expiresAt', '<=', now)
      .limit(500)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.update(d.ref, { status: 'expired' });
    });
    await batch.commit();
  }
});

/**
 * Sets custom claim `phone_hash` (SHA-256 of E.164) so invite rules can match `recipientPhone` hashes.
 */
exports.syncPhoneHashOnUserCreate = functions.auth.user().onCreate(async (user) => {
  if (!user.phoneNumber) return;
  const phone_hash = sha256Hex(user.phoneNumber);
  await admin.auth().setCustomUserClaims(user.uid, { phone_hash });
  const db = admin.firestore();
  await db.collection('users').doc(user.uid).set({ phoneHash: phone_hash }, { merge: true });
});

/**
 * Call after linking phone to Auth so `phone_hash` matches new `user.phoneNumber`.
 */
exports.refreshPhoneHashClaim = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const user = await admin.auth().getUser(request.auth.uid);
  if (!user.phoneNumber) {
    throw new HttpsError('failed-precondition', 'No phone number on this account.');
  }
  const phone_hash = sha256Hex(user.phoneNumber);
  await admin.auth().setCustomUserClaims(request.auth.uid, { phone_hash });
  const db = admin.firestore();
  await db.collection('users').doc(request.auth.uid).set({ phoneHash: phone_hash }, { merge: true });
  return { ok: true };
});

function usernameFromEmailNormalized(emailNorm) {
  if (!emailNorm || typeof emailNorm !== 'string') return '@user';
  const at = emailNorm.indexOf('@');
  if (at <= 0) return '@user';
  const local = emailNorm.slice(0, at).replace(/\./g, '_');
  return local ? `@${local}` : '@user';
}

/**
 * Callable: input `{ hashes: string[] }` (SHA-256 hex of E.164). Returns mySplit users whose
 * `users.phoneHash` matches. Never exposes raw phone numbers.
 */
exports.findUsersByPhoneHash = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const raw = request.data?.hashes;
  if (!Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Expected { hashes: string[] }.');
  }
  const hashes = [...new Set(raw.map((h) => String(h).toLowerCase().trim()))].filter(Boolean);
  if (hashes.length > 2000) {
    throw new HttpsError('invalid-argument', 'Too many hashes.');
  }
  if (hashes.length === 0) {
    return { matches: [] };
  }

  const db = admin.firestore();
  const uid = request.auth.uid;
  const matches = [];
  const seenUids = new Set();

  for (let i = 0; i < hashes.length; i += 30) {
    const chunk = hashes.slice(i, i + 30);
    const snap = await db.collection('users').where('phoneHash', 'in', chunk).get();
    snap.docs.forEach((doc) => {
      if (doc.id === uid) return;
      if (seenUids.has(doc.id)) return;
      const data = doc.data() || {};
      const ph = typeof data.phoneHash === 'string' ? data.phoneHash.toLowerCase() : '';
      if (!ph || !chunk.includes(ph)) return;
      seenUids.add(doc.id);
      const displayName =
        typeof data.displayName === 'string' && data.displayName.trim()
          ? data.displayName.trim()
          : 'mySplit user';
      const avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : null;
      const emailNorm = typeof data.emailNormalized === 'string' ? data.emailNormalized : '';
      matches.push({
        uid: doc.id,
        displayName,
        avatarUrl,
        username: usernameFromEmailNormalized(emailNorm),
        requestHash: ph,
      });
    });
  }

  return { matches };
});

/**
 * Callable after creating a subscription from the wizard: notifies existing app members on the split
 * and sends a confirmation push to the owner. Stripe PaymentIntents for autoCharge are created by
 * `advanceBillingCycles` when `nextBillingAt` is due — not here (avoids duplicating cycle logic).
 *
 * Input: `{ subscriptionId: string }`
 */
exports.finalizeSubscriptionWizard = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const ownerUid = request.auth.uid;
  const subscriptionId = request.data?.subscriptionId;
  if (typeof subscriptionId !== 'string' || !subscriptionId.trim()) {
    throw new HttpsError('invalid-argument', 'Expected { subscriptionId: string }.');
  }

  const db = admin.firestore();
  const subRef = db.collection('subscriptions').doc(subscriptionId.trim());
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    throw new HttpsError('not-found', 'Subscription not found.');
  }

  const sub = subSnap.data();
  if (sub.ownerUid !== ownerUid) {
    throw new HttpsError('permission-denied', 'Only the split owner can finalize.');
  }
  if (sub.status !== 'active') {
    return { ok: true, skipped: true };
  }

  const serviceName =
    typeof sub.serviceName === 'string' && sub.serviceName.trim()
      ? sub.serviceName.trim()
      : typeof sub.planName === 'string' && sub.planName.trim()
        ? sub.planName.trim()
        : 'a split';

  const creatorDoc = await db.collection('users').doc(ownerUid).get();
  const dn = creatorDoc.data()?.displayName;
  const senderName = typeof dn === 'string' && dn.trim() ? dn.trim() : 'Someone';

  const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
  const notified = new Set();
  const memberBody = `${senderName} added you to ${serviceName}`;

  for (const share of shares) {
    if (!share || share.role === 'owner' || share.invitePending) continue;
    const mid = share.memberId;
    if (typeof mid !== 'string' || !mid.trim() || mid === ownerUid) continue;
    if (notified.has(mid)) continue;
    notified.add(mid);

    await sendMySplitPushToUser(db, mid, memberBody, {
      type: 'split_member_added',
      subscriptionId: subRef.id,
      inviterUid: ownerUid,
    });
  }

  const ownerBody = `Your ${serviceName} split is set up.`;
  await sendMySplitPushToUser(db, ownerUid, ownerBody, {
    type: 'subscription_wizard_complete',
    subscriptionId: subRef.id,
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Billing cycle advancement
// ---------------------------------------------------------------------------

const MONTH_NAMES_LOWER = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

/**
 * Parses a stored billingDayLabel back to { day, monthIndex }.
 * Handles "Every 15th" (monthly) and "January 15th" (yearly).
 */
function parseBillingDayLabel(label) {
  if (!label) return null;
  const lower = String(label).toLowerCase().trim();
  for (let i = 0; i < MONTH_NAMES_LOWER.length; i++) {
    if (lower.startsWith(MONTH_NAMES_LOWER[i])) {
      const m = lower.match(/(\d+)/);
      if (!m) return null;
      return { day: parseInt(m[1], 10), monthIndex: i };
    }
  }
  const m = lower.match(/(\d+)/);
  if (!m) return null;
  return { day: parseInt(m[1], 10), monthIndex: null };
}

function clampDayToMonth(year, month, day) {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

/**
 * Returns the next billing Firestore Timestamp after `afterTs`.
 */
function nextBillingTimestamp(billingDayLabel, billingCycle, afterTs) {
  const parsed = parseBillingDayLabel(billingDayLabel);
  if (!parsed) {
    const fallback = afterTs.toDate();
    fallback.setDate(fallback.getDate() + 30);
    return admin.firestore.Timestamp.fromDate(fallback);
  }
  const after = afterTs.toDate();
  const today = new Date(after.getFullYear(), after.getMonth(), after.getDate());

  if (billingCycle === 'yearly' && parsed.monthIndex !== null) {
    let y = today.getFullYear();
    let d = clampDayToMonth(y, parsed.monthIndex, parsed.day);
    let candidate = new Date(y, parsed.monthIndex, d);
    if (candidate.getTime() <= today.getTime()) {
      y += 1;
      d = clampDayToMonth(y, parsed.monthIndex, parsed.day);
      candidate = new Date(y, parsed.monthIndex, d);
    }
    return admin.firestore.Timestamp.fromDate(candidate);
  }

  let y = today.getFullYear();
  let mo = today.getMonth();
  let d = clampDayToMonth(y, mo, parsed.day);
  let candidate = new Date(y, mo, d);
  if (candidate.getTime() <= today.getTime()) {
    mo += 1;
    if (mo > 11) { mo = 0; y += 1; }
    d = clampDayToMonth(y, mo, parsed.day);
    candidate = new Date(y, mo, d);
  }
  return admin.firestore.Timestamp.fromDate(candidate);
}

async function advanceOneCycle(db, subDoc, now) {
  const sub = subDoc.data();
  const subId = subDoc.id;
  try {
    const currentCyclesSnap = await subDoc.ref
      .collection('billing_cycles')
      .where('status', '==', 'current')
      .get();

    const nextBillingAt = nextBillingTimestamp(sub.billingDayLabel, sub.billingCycle, now);

    const beforeMps = sub.memberPaymentStatus || {};
    const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
    const cycleMembers = shares.filter((s) => s && s.role !== 'owner' && !s.invitePending);
    let paidCount = 0;
    let collectedCents = 0;
    let outstandingCents = 0;
    for (const s of cycleMembers) {
      const st = beforeMps[s.memberId];
      const amt = typeof s.amountCents === 'number' ? s.amountCents : 0;
      if (st === 'paid') {
        paidCount++;
        collectedCents += amt;
      } else {
        outstandingCents += amt;
      }
    }
    const totalCount = cycleMembers.length;
    const cycleMonthLabel = formatCycleMonthLabel(now);
    const subNameForActivity = subscriptionLabelFromData(sub);
    const serviceIdForActivity = slugifyServiceIdFromName(subNameForActivity);
    const ownerUidForActivity = sub.ownerUid;

    const newMemberPaymentStatus = {};
    for (const share of shares) {
      if (share.role === 'owner') {
        newMemberPaymentStatus[share.memberId] = 'owner';
      } else if (share.invitePending) {
        newMemberPaymentStatus[share.memberId] = 'invited_pending';
      } else {
        newMemberPaymentStatus[share.memberId] = 'pending';
      }
    }

    const batch = db.batch();
    currentCyclesSnap.docs.forEach((d) =>
      batch.update(d.ref, {
        status: 'closed',
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    );

    const newCycleRef = subDoc.ref.collection('billing_cycles').doc();
    batch.set(newCycleRef, {
      label: 'current',
      billingDayLabel: sub.billingDayLabel,
      totalCents: sub.totalCents,
      billingCycle: sub.billingCycle,
      status: 'current',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(subDoc.ref, {
      memberPaymentStatus: newMemberPaymentStatus,
      nextBillingAt,
      lastAdvancedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    if (typeof ownerUidForActivity === 'string' && ownerUidForActivity && totalCount > 0) {
      try {
        if (paidCount === totalCount) {
          await appendActivityEvent(db, ownerUidForActivity, {
            type: 'billing_cycle_complete',
            subscriptionId: subId,
            subscriptionName: subNameForActivity,
            serviceId: serviceIdForActivity,
            amount: collectedCents,
            metadata: {
              cycleMonth: cycleMonthLabel,
              memberCount: totalCount,
            },
          });
        } else {
          const totalCentsGuess =
            typeof sub.totalCents === 'number' && Number.isFinite(sub.totalCents)
              ? sub.totalCents
              : collectedCents + outstandingCents;
          await appendActivityEvent(db, ownerUidForActivity, {
            type: 'billing_cycle_partial',
            subscriptionId: subId,
            subscriptionName: subNameForActivity,
            serviceId: serviceIdForActivity,
            amount: totalCentsGuess,
            metadata: {
              cycleMonth: cycleMonthLabel,
              paidCount,
              totalCount,
              outstanding: outstandingCents,
            },
          });
        }
      } catch (e) {
        console.warn('advanceOneCycle: billing cycle activity failed', e?.message || e);
      }
    }

    // Create payment_intents docs for non-owner members
    const nonOwners = shares.filter(
      (s) => s.role !== 'owner' && !s.invitePending && s.amountCents > 0
    );

    if (nonOwners.length > 0) {
      await Promise.all(
        nonOwners.map((share) =>
          db.collection('payment_intents').add({
            subscriptionId: subId,
            billingCycleId: newCycleRef.id,
            payer: share.memberId,
            recipient: sub.ownerUid,
            amountCents: share.amountCents,
            status: 'pending',
            due_date: nextBillingAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        )
      );
    }

    if (sub.autoCharge && stripe) {
      await Promise.all(
        nonOwners.map((share) =>
          createStripePaymentIntent(db, subId, sub, share)
        )
      );
    } else if (sub.autoCharge && !stripe) {
      console.warn(`advanceBillingCycles: autoCharge=true for ${subId} but STRIPE_SECRET_KEY is not set.`);
    }

    console.log(`advanceBillingCycles: advanced ${subId} → nextBillingAt=${nextBillingAt.toDate().toISOString()}`);
  } catch (err) {
    console.error(`advanceBillingCycles: failed for subscription ${subId}`, err);
  }
}

async function createStripePaymentIntent(db, subId, sub, share) {
  const userDoc = await db.collection('users').doc(share.memberId).get();
  const stripeCustomerId = userDoc.data()?.stripeCustomerId;
  if (!stripeCustomerId) {
    console.warn(`advanceBillingCycles: no stripeCustomerId for member ${share.memberId} on sub ${subId}`);
    return;
  }
  try {
    await stripe.paymentIntents.create({
      amount: share.amountCents,
      currency: 'usd',
      customer: stripeCustomerId,
      confirm: false,
      metadata: { subscriptionId: subId, memberId: share.memberId },
    });
  } catch (err) {
    console.error(`advanceBillingCycles: Stripe error for member ${share.memberId}`, err);
  }
}

/**
 * Daily job at 02:00 UTC: advances billing cycles for active subscriptions
 * whose nextBillingAt has passed, resets memberPaymentStatus, creates
 * payment_intents docs, and triggers Stripe PaymentIntents when autoCharge is on.
 */
exports.advanceBillingCycles = onSchedule('every day 02:00', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  let startAfter = null;

  while (true) {
    let q = db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .where('nextBillingAt', '<=', now)
      .orderBy('nextBillingAt')
      .limit(100);
    if (startAfter) q = q.startAfter(startAfter);

    const snap = await q.get();
    if (snap.empty) break;

    await Promise.all(snap.docs.map((subDoc) => advanceOneCycle(db, subDoc, now)));

    if (snap.docs.length < 100) break;
    startAfter = snap.docs[snap.docs.length - 1];
  }
});

const INVITE_PENDING_MS = 7 * 24 * 60 * 60 * 1000;

async function markInviteDocExpired(db, inviteId) {
  if (typeof inviteId !== 'string' || !inviteId.trim()) return;
  try {
    await db.collection('invites').doc(inviteId).update({ status: 'expired' });
  } catch (e) {
    console.warn('markInviteDocExpired:', inviteId, e?.message || e);
  }
}

/**
 * Daily: roster slots still `pending` after 7 days → `expired`; notify owner (push + activity + bell).
 */
exports.expirePendingSplitInvites = onSchedule('every day 03:00', async () => {
  const db = admin.firestore();
  const nowMs = Date.now();
  let startAfter = null;

  while (true) {
    /** Order by document ID only — avoids a composite index (status + __name__) that Firestore rejects as unnecessary. */
    let q = db.collection('subscriptions').orderBy(admin.firestore.FieldPath.documentId()).limit(80);
    if (startAfter) q = q.startAfter(startAfter);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (String(data.status ?? '').toLowerCase() !== 'active') continue;

      const members = Array.isArray(data.members) ? data.members : [];
      if (members.length === 0 || typeof members[0] !== 'object') continue;

      const ownerUid = typeof data.ownerUid === 'string' ? data.ownerUid : '';
      if (!ownerUid) continue;

      const shares = Array.isArray(data.splitMemberShares)
        ? data.splitMemberShares.map((s) => (s && typeof s === 'object' ? { ...s } : s))
        : [];
      const newMembers = members.map((m) => (m && typeof m === 'object' ? { ...m } : m));
      const mps = { ...(data.memberPaymentStatus || {}) };

      const expiredSlots = [];
      for (let i = 0; i < newMembers.length; i++) {
        const m = newMembers[i];
        if (!m || typeof m !== 'object') continue;
        if (m.memberStatus !== 'pending') continue;
        const t0 = invitedAtToMillis(m.invitedAt);
        if (t0 == null) continue;
        if (nowMs - t0 < INVITE_PENDING_MS) continue;

        const inviteId = typeof m.inviteId === 'string' ? m.inviteId : '';
        const uid = typeof m.uid === 'string' ? m.uid : '';
        const shareRow =
          shares.find((s) => s && inviteId && s.inviteId === inviteId) ||
          shares.find((s) => s && uid && s.memberId === uid);
        const displayName =
          shareRow && typeof shareRow.displayName === 'string' && shareRow.displayName.trim()
            ? shareRow.displayName.trim()
            : 'Member';
        const memberId = shareRow && typeof shareRow.memberId === 'string' ? shareRow.memberId : uid;
        expiredSlots.push({ index: i, inviteId, uid, displayName, memberId });
      }

      if (expiredSlots.length === 0) continue;

      for (const slot of expiredSlots) {
        newMembers[slot.index] = {
          ...newMembers[slot.index],
          memberStatus: 'expired',
        };
      }

      for (const s of shares) {
        if (!s) continue;
        const hit = expiredSlots.some(
          (slot) =>
            (slot.inviteId && s.inviteId === slot.inviteId) ||
            (slot.uid && s.memberId === slot.uid) ||
            (slot.memberId && s.memberId === slot.memberId)
        );
        if (hit) {
          s.invitePending = false;
          s.inviteExpired = true;
        }
      }

      for (const slot of expiredSlots) {
        const mid = slot.memberId || slot.uid;
        if (mid && mps[mid] === 'invited_pending') delete mps[mid];
      }

      try {
        await doc.ref.update({
          members: newMembers,
          splitMemberShares: shares,
          memberPaymentStatus: mps,
          splitUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn('expirePendingSplitInvites: update failed', doc.id, e?.message || e);
        continue;
      }

      const subName = subscriptionLabelFromData(data);
      const serviceIdSlug = slugifyServiceIdFromName(subName);

      for (const slot of expiredSlots) {
        if (slot.inviteId) await markInviteDocExpired(db, slot.inviteId);
        const first = slot.displayName.split(/\s+/)[0] || slot.displayName;
        const body = `${first}'s invite to ${subName} expired · invite someone else?`;
        try {
          await sendMySplitPushToUser(
            db,
            ownerUid,
            body,
            {
              type: 'split_invite_expired',
              subscriptionId: doc.id,
              inviteId: slot.inviteId || '',
              memberUid: slot.uid || '',
            },
            { title: `Invite expired · ${subName}` }
          );
        } catch (e) {
          console.warn('expirePendingSplitInvites: owner push failed', e?.message || e);
        }

        try {
          await appendActivityEvent(db, ownerUid, {
            type: 'split_invite_expired',
            subscriptionId: doc.id,
            subscriptionName: subName,
            serviceId: serviceIdSlug,
            metadata: {
              inviteeName: slot.displayName,
              inviteId: slot.inviteId || '',
            },
          });
        } catch (e) {
          console.warn('expirePendingSplitInvites: owner activity failed', e?.message || e);
        }

        try {
          await db.collection('users').doc(ownerUid).collection('notifications').add({
            type: 'split_invite_expired',
            title: `${first}'s invite to ${subName} expired`,
            body: 'Invite someone else · Open to manage',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            deepLink: `/subscription/${doc.id}`,
            subscriptionId: doc.id,
            serviceId: serviceIdSlug,
            metadata: {
              inviteeName: slot.displayName,
              inviteId: slot.inviteId || '',
            },
          });
          await incrementUnreadNotificationCount(db, ownerUid);
        } catch (e) {
          console.warn('expirePendingSplitInvites: owner notification failed', e?.message || e);
        }
      }
    }

    if (snap.docs.length < 80) break;
    startAfter = snap.docs[snap.docs.length - 1];
  }
});

/** Must match lib/activity/activityFeedSchema.ts ACTIVITY_FEED_MAX_EVENTS */
const MAX_USER_ACTIVITY_EVENTS = 200;

/**
 * Keeps at most MAX_USER_ACTIVITY_EVENTS per user, deleting oldest by `createdAt` first.
 * Runs when Cloud Functions (or admin) append to `users/{userId}/activity`.
 */
exports.pruneUserActivityFeed = onDocumentCreated('users/{userId}/activity/{activityId}', async (event) => {
  const db = admin.firestore();
  const userId = event.params.userId;
  const colRef = db.collection('users').doc(userId).collection('activity');

  while (true) {
    const countSnap = await colRef.count().get();
    const total = countSnap.data().count;
    if (total <= MAX_USER_ACTIVITY_EVENTS) return;

    const excess = Math.min(total - MAX_USER_ACTIVITY_EVENTS, 500);
    const oldSnap = await colRef.orderBy('createdAt', 'asc').limit(excess).get();
    if (oldSnap.empty) {
      console.warn(`pruneUserActivityFeed: count=${total} but no docs to delete for user ${userId}`);
      return;
    }

    const batch = db.batch();
    oldSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
});
