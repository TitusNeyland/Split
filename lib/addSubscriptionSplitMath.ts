/** Pure split math shared by add-subscription flow and editors. */

export function equalIntegerPercents(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const rem = 100 - n * base;
  const arr = Array(n).fill(base);
  for (let i = n - rem; i < n; i++) arr[i]++;
  return arr;
}

export function equalCentsSplit(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const rem = totalCents - n * base;
  const arr = Array(n).fill(base);
  for (let i = n - rem; i < n; i++) arr[i]++;
  return arr;
}

export function allocateCents(totalCents: number, weights: number[]): number[] {
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (totalCents * w) / wsum);
  const floor = exact.map((x) => Math.floor(x));
  let rem = totalCents - floor.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - floor[i]! }))
    .sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) {
    out[order[k % order.length]!.i] += 1;
  }
  return out;
}

export function parsePercent(raw: string): number {
  const s = raw.replace(/%/g, '').trim();
  if (s === '') return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function parseDollarToCents(raw: string): number {
  const s = raw.replace(/[$\s]/g, '').trim();
  if (s === '') return NaN;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function percentTotalIsExactly100(values: number[]): boolean {
  if (values.some((v) => !Number.isFinite(v))) return false;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) < 1e-6;
}

/** Owner pays $0 / 0%; others split remainder evenly. Single member = full share. */
export function ownerLessIntegerPercents(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [100];
  const rest = equalIntegerPercents(n - 1);
  return [0, ...rest];
}

export function ownerLessCentsSplit(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [totalCents];
  const rest = equalCentsSplit(totalCents, n - 1);
  return [0, ...rest];
}

export function normalizeAmountInput(raw: string): string {
  let t = raw.replace(/[^\d.]/g, '');
  const dot = t.indexOf('.');
  if (dot !== -1) {
    const intPart = t.slice(0, dot + 1);
    const dec = t.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    t = intPart + dec;
  }
  return t;
}
