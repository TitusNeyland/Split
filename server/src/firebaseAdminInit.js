import admin from 'firebase-admin';

export function ensureFirebaseAdmin() {
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
 * @param {import('express').Request} req
 * @returns {Promise<string>} uid
 */
export async function getUidFromBearer(req) {
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
  if (!ensureFirebaseAdmin()) {
    const err = new Error('Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON)');
    err.statusCode = 503;
    throw err;
  }
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}
