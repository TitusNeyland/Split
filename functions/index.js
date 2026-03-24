const crypto = require('crypto');
const admin = require('firebase-admin');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const functions = require('firebase-functions/v1');

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
