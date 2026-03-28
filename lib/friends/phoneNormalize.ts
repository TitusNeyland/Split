/**
 * Best-effort E.164 for hashing / contact sync (US-centric fallback).
 * Returns null when there are too few digits.
 */
export function normalizePhoneToE164(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10 && t.startsWith('+')) return `+${digits}`;
  if (digits.length >= 12 && digits.startsWith('00')) {
    return `+${digits.slice(2)}`;
  }
  return null;
}
