import { Router } from 'express';
import { ensureFirebaseAdmin, getUidFromBearer } from './firebaseAdminInit.js';
import admin from 'firebase-admin';

const ISSUE_TYPES = new Set(['wrong_amount', 'not_received', 'duplicate_charge', 'other']);

async function sendSupportEmail({ subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SUPPORT_EMAIL_FROM;
  const to = process.env.SUPPORT_NOTIFY_EMAIL || 'support@mysplit.app';
  if (!key || !from) {
    console.warn('[support/payment-issue] Skipping email: set RESEND_API_KEY and SUPPORT_EMAIL_FROM');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn('[support/payment-issue] Resend error', res.status, t);
    }
  } catch (e) {
    console.warn('[support/payment-issue] Resend fetch failed', e?.message || e);
  }
}

export function createSupportRouter() {
  const r = Router();

  r.post('/payment-issue', async (req, res) => {
    try {
      const uid = await getUidFromBearer(req);
      if (!ensureFirebaseAdmin()) {
        res.status(503).json({ error: 'Firebase Admin not configured' });
        return;
      }

      const subscription = req.body?.subscription;
      const issueType = req.body?.issueType;
      const description = req.body?.description;

      if (typeof subscription !== 'string' || !subscription.trim()) {
        res.status(400).json({ error: 'subscription required' });
        return;
      }
      if (typeof issueType !== 'string' || !ISSUE_TYPES.has(issueType)) {
        res.status(400).json({ error: 'invalid issueType' });
        return;
      }
      if (typeof description !== 'string' || description.trim().length < 8) {
        res.status(400).json({ error: 'description must be at least 8 characters' });
        return;
      }

      let userEmail = null;
      try {
        const rec = await admin.auth().getUser(uid);
        userEmail = rec.email || null;
      } catch {
        /* ignore */
      }

      const row = {
        kind: 'payment_issue',
        uid,
        userEmail,
        subscription: subscription.trim(),
        issueType,
        description: description.trim(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'api',
      };

      const ref = await admin.firestore().collection('support_requests').add(row);

      const subj = `[mySplit] Payment issue — ${issueType} (${uid.slice(0, 8)}…)`;
      const esc = (s) =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      const html = `<p><strong>Payment support request</strong></p>
<ul>
<li><strong>Request id:</strong> ${esc(ref.id)}</li>
<li><strong>UID:</strong> ${esc(uid)}</li>
<li><strong>Email:</strong> ${esc(userEmail || '—')}</li>
<li><strong>Subscription:</strong> ${esc(subscription.trim())}</li>
<li><strong>Issue:</strong> ${esc(issueType)}</li>
</ul>
<p><strong>Description</strong></p>
<p>${esc(description.trim()).replace(/\n/g, '<br/>')}</p>`;

      await sendSupportEmail({ subject: subj, html });

      res.json({ ok: true, id: ref.id });
    } catch (e) {
      const status = e.statusCode || 500;
      if (status >= 500) console.error(e);
      res.status(status).json({ error: e.message || 'Support request failed' });
    }
  });

  return r;
}
