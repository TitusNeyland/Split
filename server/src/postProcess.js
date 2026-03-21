/**
 * Receipt line post-processing: strip noise, reclassify tax/tip, merge duplicate product lines.
 */

const TAX_RE = /\b(TAX|GST|HST|VAT|SALES\s+TAX|STATE\s+TAX)\b/i;
const TIP_RE = /\b(TIP|GRATUITY|GRAT|SERVICE\s*(CHARGE|FEE)|AUTO\s*GRAT)\b/i;

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldStripLine(name) {
  const n = String(name || '').trim();
  if (n.length < 2) return true;
  const lower = n.toLowerCase();
  if (/thank you|thanks|have a nice|good day|visit us|see you|receipt|duplicate|copy/i.test(lower)) return true;
  if (/^\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(n.replace(/\s/g, ''))) return true;
  if (/\(\d{3}\)\s*\d{3}[-.]?\d{4}/.test(n)) return true;
  if (/www\.|https?:\/\/|@[a-z0-9.-]+\.[a-z]{2,}/i.test(n)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(n) && n.length < 14) return true;
  return false;
}

function reclassifyKind(item) {
  const name = String(item.name || '');
  if (item.kind === 'tax' || item.kind === 'tip') return item.kind;
  if (TIP_RE.test(name)) return 'tip';
  if (TAX_RE.test(name)) return 'tax';
  return item.kind || 'item';
}

function roundMoney(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * @param {Array<Record<string, unknown>>} rawItems
 */
export function postProcessLineItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  const cleaned = [];
  for (const row of rawItems) {
    const name = String(row.name ?? '').trim() || 'Unknown';
    const kind = reclassifyKind({
      name,
      kind: typeof row.kind === 'string' ? row.kind : 'item',
    });
    if (kind === 'item' && shouldStripLine(name)) continue;

    const quantity = Math.max(1, Number(row.quantity) || 1);
    let unitPrice =
      row.unit_price != null && !Number.isNaN(Number(row.unit_price))
        ? Number(row.unit_price)
        : null;
    let lineTotal =
      row.line_total != null && !Number.isNaN(Number(row.line_total))
        ? Number(row.line_total)
        : null;

    if (lineTotal == null && unitPrice != null) lineTotal = roundMoney(unitPrice * quantity);
    if (unitPrice == null && lineTotal != null) unitPrice = roundMoney(lineTotal / quantity);

    const confidence =
      typeof row.confidence === 'number' && !Number.isNaN(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0.75;
    const unreadable = Boolean(row.unreadable);

    cleaned.push({
      name,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      kind,
      confidence,
      unreadable,
    });
  }

  const specials = [];
  const onlyItems = [];
  for (const it of cleaned) {
    if (it.kind !== 'item') specials.push({ ...it });
    else onlyItems.push({ ...it });
  }
  return [...mergeItemRows(onlyItems), ...specials];
}

function mergeItemRows(items) {
  const merged = [];
  const bucket = new Map();

  for (const it of items) {
    const key = normalizeName(it.name);
    if (!key) {
      merged.push({ ...it });
      continue;
    }
    const prev = bucket.get(key);
    if (!prev) {
      const copy = { ...it };
      bucket.set(key, copy);
      merged.push(copy);
      continue;
    }
    const q1 = prev.quantity || 1;
    const q2 = it.quantity || 1;
    const t1 = prev.line_total ?? 0;
    const t2 = it.line_total ?? 0;
    prev.quantity = q1 + q2;
    prev.line_total = roundMoney(t1 + t2);
    prev.unit_price =
      prev.line_total != null && prev.quantity > 0
        ? roundMoney(prev.line_total / prev.quantity)
        : prev.unit_price;
    prev.confidence = Math.min(prev.confidence, it.confidence);
    prev.unreadable = prev.unreadable || it.unreadable;
  }

  return merged;
}
