/**
 * Deterministic avatar colors per friend id so initials look the same on Profile, Home, etc.
 */
const PALETTES: { bg: string; color: string }[] = [
  { bg: '#EEEDFE', color: '#534AB7' },
  { bg: '#E1F5EE', color: '#0F6E56' },
  { bg: '#FAEEDA', color: '#854F0B' },
  { bg: '#FAECE7', color: '#993C1D' },
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#E6F1FB', color: '#185FA5' },
  { bg: '#FCEBEB', color: '#A32D2D' },
  { bg: '#F0EEE9', color: '#5F5E5A' },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getFriendAvatarColors(id: string): { backgroundColor: string; color: string } {
  const idx = hashId(id) % PALETTES.length;
  const p = PALETTES[idx]!;
  return { backgroundColor: p.bg, color: p.color };
}

/** Current user chip on “you owe” rows — stable, distinct from hashed friends. */
export const CURRENT_USER_AVATAR = {
  backgroundColor: '#EDE9FE',
  color: '#5B21B6',
} as const;
