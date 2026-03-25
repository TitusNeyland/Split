const crypto = require('crypto');
const admin = require('firebase-admin');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
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
