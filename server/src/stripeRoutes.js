import { Router } from 'express';
import Stripe from 'stripe';
import admin from 'firebase-admin';

const EPHEMERAL_KEY_API_VERSION = '2024-11-20.acacia';

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

/**
 * @returns {Promise<{ uid: string, email: string | null }>}
 */
async function requireFirebaseUser(req) {
  const authz = req.headers.authorization;
  if (!authz?.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.statusCode = 401;
    throw err;
  }
  const token = authz.slice(7).trim();
  if (!token) {
    const err = new Error('Missing token');
    err.statusCode = 401;
    throw err;
  }

  if (initFirebaseAdmin()) {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null };
  }

  if (process.env.STRIPE_DEV_BYPASS === '1') {
    const uid = req.headers['x-firebase-uid'] || req.body?.devUid;
    if (!uid || typeof uid !== 'string') {
      const err = new Error('STRIPE_DEV_BYPASS: send x-firebase-uid header or body.devUid');
      err.statusCode = 401;
      throw err;
    }
    return { uid, email: typeof req.body?.email === 'string' ? req.body.email : null };
  }

  const err = new Error(
    'Server auth not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or STRIPE_DEV_BYPASS=1 for local dev.',
  );
  err.statusCode = 503;
  throw err;
}

function defaultPaymentMethodId(customer) {
  if (!customer || customer.deleted) return null;
  const d = customer.invoice_settings?.default_payment_method;
  if (!d) return null;
  return typeof d === 'string' ? d : d.id;
}

async function assertCustomerOwned(customerId, uid) {
  if (!stripe) {
    const err = new Error('Stripe not configured');
    err.statusCode = 503;
    throw err;
  }
  const c = await stripe.customers.retrieve(customerId);
  if (c && typeof c === 'object' && 'deleted' in c && c.deleted) {
    const err = new Error('Customer not found');
    err.statusCode = 404;
    throw err;
  }
  if (c.metadata?.firebase_uid !== uid) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
  return c;
}

export function createStripeRouter() {
  const router = Router();

  router.post('/customer', async (req, res) => {
    try {
      if (!stripe) {
        res.status(503).json({ error: 'Stripe is not configured (STRIPE_SECRET_KEY).' });
        return;
      }
      const { uid, email } = await requireFirebaseUser(req);

      const search = await stripe.customers.search({
        query: `metadata['firebase_uid']:'${uid}'`,
        limit: 1,
      });
      if (search.data.length > 0) {
        res.json({ customerId: search.data[0].id });
        return;
      }

      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { firebase_uid: uid },
      });
      res.json({ customerId: customer.id });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error(e);
      res.status(status).json({ error: e.message || 'Failed to create customer' });
    }
  });

  router.get('/payment-methods', async (req, res) => {
    try {
      if (!stripe) {
        res.status(503).json({ error: 'Stripe is not configured.' });
        return;
      }
      const { uid } = await requireFirebaseUser(req);
      const customerId = req.query.customerId;
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({ error: 'customerId query required' });
        return;
      }
      await assertCustomerOwned(customerId, uid);

      const [list, customer] = await Promise.all([
        stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
        stripe.customers.retrieve(customerId, {
          expand: ['invoice_settings.default_payment_method'],
        }),
      ]);

      const defaultId = defaultPaymentMethodId(customer);

      const paymentMethods = list.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'unknown',
        last4: pm.card?.last4 ?? '****',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        isDefault: pm.id === defaultId,
      }));

      res.json({ paymentMethods });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error(e);
      res.status(status).json({ error: e.message || 'Failed to list payment methods' });
    }
  });

  router.post('/setup-intent', async (req, res) => {
    try {
      if (!stripe) {
        res.status(503).json({ error: 'Stripe is not configured.' });
        return;
      }
      const { uid } = await requireFirebaseUser(req);
      const customerId = req.body?.customerId;
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({ error: 'customerId required' });
        return;
      }
      await assertCustomerOwned(customerId, uid);

      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: EPHEMERAL_KEY_API_VERSION },
      );

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      });

      res.json({
        customerId,
        customerEphemeralKeySecret: ephemeralKey.secret,
        setupIntentClientSecret: setupIntent.client_secret,
      });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error(e);
      res.status(status).json({ error: e.message || 'Failed to create setup intent' });
    }
  });

  router.post('/set-default-payment-method', async (req, res) => {
    try {
      if (!stripe) {
        res.status(503).json({ error: 'Stripe is not configured.' });
        return;
      }
      const { uid } = await requireFirebaseUser(req);
      const { customerId, paymentMethodId } = req.body || {};
      if (!customerId || !paymentMethodId) {
        res.status(400).json({ error: 'customerId and paymentMethodId required' });
        return;
      }
      await assertCustomerOwned(customerId, uid);

      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      res.json({ ok: true });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error(e);
      res.status(status).json({ error: e.message || 'Failed to set default' });
    }
  });

  router.post('/detach-payment-method', async (req, res) => {
    try {
      if (!stripe) {
        res.status(503).json({ error: 'Stripe is not configured.' });
        return;
      }
      const { uid } = await requireFirebaseUser(req);
      const { customerId, paymentMethodId } = req.body || {};
      if (!customerId || !paymentMethodId) {
        res.status(400).json({ error: 'customerId and paymentMethodId required' });
        return;
      }
      await assertCustomerOwned(customerId, uid);

      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      const defaultId = defaultPaymentMethodId(customer);
      if (defaultId === paymentMethodId) {
        res.status(400).json({
          error: 'Cannot remove the default card. Set another card as default first.',
        });
        return;
      }

      await stripe.paymentMethods.detach(paymentMethodId);
      res.json({ ok: true });
    } catch (e) {
      const status = e.statusCode || 500;
      console.error(e);
      res.status(status).json({ error: e.message || 'Failed to detach payment method' });
    }
  });

  return router;
}
