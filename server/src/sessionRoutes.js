import { Router } from 'express';
import { ensureFirebaseAdmin, getUidFromBearer } from './firebaseAdminInit.js';
import admin from 'firebase-admin';

/**
 * Revoke another login session: delete Firestore doc and send silent FCM so that
 * device calls signOut(). Remote logout is enforced client-side via FCM + local signOut.
 */
export function createSessionRouter() {
  const r = Router();

  r.post('/revoke', async (req, res) => {
    try {
      const uid = await getUidFromBearer(req);
      const sessionId = req.body?.sessionId;
      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ error: 'sessionId required' });
        return;
      }

      if (!ensureFirebaseAdmin()) {
        res.status(503).json({ error: 'Firebase Admin not configured' });
        return;
      }

      const ref = admin.firestore().doc(`users/${uid}/sessions/${sessionId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        res.json({ ok: true, deleted: false });
        return;
      }

      const data = snap.data() || {};
      const fcmToken = typeof data.fcmToken === 'string' && data.fcmToken.trim() ? data.fcmToken.trim() : null;

      await ref.delete();

      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            data: { type: 'SESSION_REVOKED' },
            android: { priority: 'high' },
            apns: {
              headers: { 'apns-priority': '5' },
              payload: { aps: { 'content-available': 1 } },
            },
          });
        } catch (e) {
          console.warn('[sessions/revoke] FCM send failed (token may be stale)', e?.message || e);
        }
      }

      res.json({ ok: true, deleted: true });
    } catch (e) {
      const status = e.statusCode || 500;
      if (status >= 500) console.error(e);
      res.status(status).json({ error: e.message || 'Revoke failed' });
    }
  });

  return r;
}
