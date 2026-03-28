import Stripe from 'stripe';
import admin from 'firebase-admin';

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

function initFirebaseAdmin() {
  if (admin.apps.length) return true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return false;
  try {
    const cred = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return true;
  } catch (e) {
    console.error('firebase-admin init failed', e);
    return false;
  }
}

async function getUserDisplayName(db, uid) {
  if (typeof uid !== 'string' || !uid) return 'Someone';
  const snap = await db.collection('users').doc(uid).get();
  const dn = snap.data()?.displayName;
  return typeof dn === 'string' && dn.trim() ? dn.trim() : 'Someone';
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

/**
 * Stripe webhook: `payment_intent.payment_failed` → activity on payer + subscription owner feeds.
 * Configure `STRIPE_WEBHOOK_SECRET` and point Stripe to `POST /api/stripe/webhook` (raw body).
 */
export async function stripeWebhookHandler(req, res) {
  if (!stripe) {
    res.status(503).send('Stripe not configured');
    return;
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    res.status(503).send('Webhook secret not configured');
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature');
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type !== 'payment_intent.payment_failed') {
    res.json({ received: true });
    return;
  }

  if (!initFirebaseAdmin()) {
    res.status(503).send('Firebase not configured');
    return;
  }

  const pi = event.data.object;
  const metadata = pi.metadata || {};
  const subscriptionId = metadata.subscriptionId;
  const memberId = metadata.memberId;
  if (typeof subscriptionId !== 'string' || typeof memberId !== 'string') {
    res.json({ received: true });
    return;
  }

  const db = admin.firestore();
  const subSnap = await db.collection('subscriptions').doc(subscriptionId).get();
  if (!subSnap.exists) {
    res.json({ received: true });
    return;
  }

  const sub = subSnap.data();
  const ownerUid = sub.ownerUid;
  if (typeof ownerUid !== 'string' || !ownerUid) {
    res.json({ received: true });
    return;
  }

  const subName = subscriptionLabelFromData(sub);
  const serviceId = slugifyServiceIdFromName(subName);
  const amountCents = typeof pi.amount === 'number' ? pi.amount : 0;
  const failureReason =
    pi.last_payment_error && typeof pi.last_payment_error.code === 'string'
      ? pi.last_payment_error.code
      : 'failed';
  const retryAt = admin.firestore.Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const actorName = await getUserDisplayName(db, memberId);

  const docId = `failed_pi_${pi.id}`;
  const payload = {
    type: 'payment_failed',
    subscriptionId,
    subscriptionName: subName,
    serviceId,
    actorUid: memberId,
    actorName,
    amount: amountCents,
    read: false,
    metadata: { failureReason, retryAt, stripePaymentIntentId: pi.id },
  };

  const ts = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection('users')
    .doc(memberId)
    .collection('activity')
    .doc(docId)
    .set({ ...payload, createdAt: ts }, { merge: true });
  await db
    .collection('users')
    .doc(ownerUid)
    .collection('activity')
    .doc(docId)
    .set({ ...payload, createdAt: ts }, { merge: true });

  res.json({ received: true });
}
