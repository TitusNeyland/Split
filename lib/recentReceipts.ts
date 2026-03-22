import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReceiptAssignSession, StoredReceiptRecord } from './receiptTypes';

const STORAGE_KEY = '@split/recent_receipts_v1';
const MAX_ITEMS = 40;

/** Current user for "your share" (replace with auth). */
export const RECEIPT_CURRENT_USER = 'Titus';

export function newReceiptId() {
  return `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseReceiptDateMs(label: string | null | undefined): number | null {
  if (!label?.trim()) return null;
  const t = Date.parse(label);
  if (!Number.isNaN(t)) return t;
  const tryNative = new Date(label);
  const ms = tryNative.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function summarizeReceiptSession(
  session: ReceiptAssignSession
): Omit<StoredReceiptRecord, 'id' | 'updatedAt' | 'session'> {
  const lines = session.lines;
  const itemCount = lines.filter((l) => l.kind === 'item').length;
  const people = new Set<string>();
  for (const l of lines) {
    if (l.kind !== 'item' || !l.selected) continue;
    if (l.assignedTo && l.assignedTo !== 'Assign →') people.add(l.assignedTo);
  }
  const peopleCount = Math.max(people.size, 1);

  let totalAmount = 0;
  let yourShare = 0;
  for (const l of lines) {
    if (!l.selected || l.line_total == null || Number.isNaN(l.line_total)) continue;
    totalAmount += l.line_total;
    if (l.assignedTo === RECEIPT_CURRENT_USER) yourShare += l.line_total;
    if (l.assignedTo === 'Split') {
      yourShare += l.line_total / peopleCount;
    }
  }
  totalAmount = Math.round(totalAmount * 100) / 100;
  yourShare = Math.round(yourShare * 100) / 100;

  const receiptDateMs = parseReceiptDateMs(session.receiptDate) ?? Date.now();
  const merchantName = (session.merchantName ?? 'Receipt').trim() || 'Receipt';
  const splitStatus = session.splitStatus ?? 'pending';

  return {
    receiptDateMs,
    merchantName,
    peopleCount,
    itemCount,
    totalAmount,
    yourShare,
    splitStatus,
  };
}

export async function loadRecentReceipts(): Promise<StoredReceiptRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredReceiptRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function upsertRecentFromSession(session: ReceiptAssignSession): Promise<void> {
  const id = session.receiptId ?? newReceiptId();
  const merged: ReceiptAssignSession = {
    ...session,
    receiptId: id,
    splitStatus: session.splitStatus ?? 'pending',
  };
  const summary = summarizeReceiptSession(merged);
  const row: StoredReceiptRecord = {
    id,
    updatedAt: Date.now(),
    ...summary,
    session: {
      ...merged,
      readOnly: merged.splitStatus === 'confirmed',
    },
  };

  const existing = await loadRecentReceipts();
  const others = existing.filter((r) => r.id !== id);
  const next = [row, ...others].slice(0, MAX_ITEMS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function getRecentReceiptById(id: string): Promise<StoredReceiptRecord | null> {
  const all = await loadRecentReceipts();
  return all.find((r) => r.id === id) ?? null;
}
