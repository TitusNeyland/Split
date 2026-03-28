const crypto = require('crypto');
const admin = require('firebase-admin');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
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

function inferConnectedVia(data) {
  if (data.splitId) return 'split_invite';
  const v = data.connectedVia;
  if (v === 'contacts' || v === 'direct_invite' || v === 'split_invite') return v;
  return 'direct_invite';
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

    const memberUids = (data.memberUids || []).map((u) => (u === oldMemberId ? acceptedBy : u));
    const members = (data.members || []).map((u) => (u === oldMemberId ? acceptedBy : u));
    const mps = { ...(data.memberPaymentStatus || {}) };
    if (mps[oldMemberId] === 'invited_pending') {
      delete mps[oldMemberId];
      mps[acceptedBy] = 'pending';
    }

    tx.update(subRef, {
      splitMemberShares: shares,
      memberUids,
      members,
      memberPaymentStatus: mps,
      splitUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function sendSplitInviteAcceptedNotification(db, recipientUid, subscriptionId, createdBy) {
  const subSnap = await db.collection('subscriptions').doc(subscriptionId).get();
  const serviceName =
    typeof subSnap.data()?.serviceName === 'string' && subSnap.data().serviceName.trim()
      ? subSnap.data().serviceName.trim()
      : 'a split';
  const creatorDoc = await db.collection('users').doc(createdBy).get();
  const dn = creatorDoc.data()?.displayName;
  const senderName = typeof dn === 'string' && dn.trim() ? dn.trim() : 'Someone';

  const recipientDoc = await db.collection('users').doc(recipientUid).get();
  const prefs = recipientDoc.data()?.notificationPreferences;
  if (prefs && prefs.notificationsEnabled === false) return;

  const body = `${senderName} added you to ${serviceName}`;

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
          data: {
            type: 'split_invite_accepted',
            subscriptionId,
            inviterUid: createdBy,
          },
        })
        .catch((e) => {
          console.warn('sendSplitInviteAcceptedNotification: FCM send failed', e?.message || e);
        })
    )
  );
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
 */
async function sendMySplitPushToUser(db, uid, body, dataPayload) {
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

  await Promise.all(
    [...tokens].map((token) =>
      admin
        .messaging()
        .send({
          token,
          notification: { title: 'mySplit', body },
          data,
        })
        .catch((e) => {
          console.warn('sendMySplitPushToUser: FCM send failed', e?.message || e);
        })
    )
  );
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
      await sendSplitInviteAcceptedNotification(db, acceptedBy, splitId, createdBy);
    } catch (e) {
      console.warn('onInviteAccepted: sendSplitInviteAcceptedNotification failed', e?.message || e);
    }
  }
});

/**
 * Push to the non-initiator when a friendship is created from Find People (`connectedVia: search`).
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
  const recipientDoc = await db.collection('users').doc(recipientUid).get();
  const prefs = recipientDoc.data()?.notificationPreferences;
  if (prefs && prefs.notificationsEnabled === false) return;

  const senderDoc = await db.collection('users').doc(initiatedBy).get();
  const dn = senderDoc.data()?.displayName;
  const senderName = typeof dn === 'string' && dn.trim() ? dn.trim() : 'Someone';

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

    const newMemberPaymentStatus = {};
    const shares = Array.isArray(sub.splitMemberShares) ? sub.splitMemberShares : [];
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
