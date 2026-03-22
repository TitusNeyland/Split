import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import { postProcessLineItems } from './postProcess.js';
import { createStripeRouter } from './stripeRoutes.js';
import { createSessionRouter } from './sessionRoutes.js';

const PORT = Number(process.env.PORT) || 8787;
const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SYSTEM = `You are a receipt OCR expert. Read the receipt image and return ONE JSON object only (no markdown).

Schema:
{
  "merchant_name": string | null,
  "receipt_date": string | null (human-readable if visible, else null),
  "overall_confidence": number 0-1 (how sure you are about the whole parse),
  "line_items": [
    {
      "name": string,
      "quantity": number (default 1),
      "unit_price": number | null,
      "line_total": number | null,
      "kind": "item" | "tax" | "tip" | "fee" | "unknown",
      "confidence": number 0-1 per line,
      "unreadable": boolean (true if the line is garbled or you cannot read price/name reliably)
    }
  ]
}

Rules:
- Include ONLY purchase lines, tax, tips, service charges — NOT store address, phone, URLs, "thank you", headers like "guest check", payment method footers unless they are a line total.
- Detect tax lines by keywords: TAX, GST, HST, VAT, SALES TAX (kind must be "tax").
- Detect tip/gratuity/service charge lines (kind "tip" or "fee" as appropriate).
- For duplicate product lines with the same description, output separate rows; the server may merge them.
- Use decimal numbers for money (e.g. 14.99), no currency symbols in numeric fields.
- If a line is unclear, set unreadable: true and still guess name/amounts if possible with low confidence.
- line_total should be the total for that row (price * qty when itemized that way on the receipt).
`;

function parseJsonFromContent(content) {
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON');
  return JSON.parse(trimmed.slice(start, end + 1));
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: Boolean(openai),
    hasStripe: Boolean(process.env.STRIPE_SECRET_KEY),
  });
});

app.use('/api/stripe', createStripeRouter());
app.use('/api/sessions', createSessionRouter());

app.post('/api/receipt/parse', upload.single('image'), async (req, res) => {
  try {
    if (!openai) {
      res.status(503).json({ error: 'Server missing OPENAI_API_KEY. Add it to server/.env' });
      return;
    }
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'Missing image file (field name: image)' });
      return;
    }

    const mime = file.mimetype || 'image/jpeg';
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract structured line items from this receipt image.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: 'Empty model response' });
      return;
    }

    let parsed;
    try {
      parsed = parseJsonFromContent(content);
    } catch (e) {
      res.status(502).json({ error: 'Failed to parse model JSON', detail: String(e.message) });
      return;
    }

    const rawItems = Array.isArray(parsed.line_items) ? parsed.line_items : [];
    const line_items = postProcessLineItems(rawItems);

    res.json({
      merchant_name: parsed.merchant_name ?? null,
      receipt_date: parsed.receipt_date ?? null,
      overall_confidence:
        typeof parsed.overall_confidence === 'number' ? parsed.overall_confidence : null,
      line_items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Receipt parse failed',
      detail: process.env.NODE_ENV === 'development' ? String(err.message || err) : undefined,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Receipt API http://localhost:${PORT}`);
});
