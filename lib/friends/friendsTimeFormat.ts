import type { Timestamp } from 'firebase/firestore';

export function formatInviteSentAgo(createdAt: Timestamp | null): string {
  if (!createdAt || typeof createdAt.toMillis !== 'function') return 'Sent recently';
  const ms = createdAt.toMillis();
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'Sent today';
  if (days === 1) return 'Sent 1 day ago';
  return `Sent ${days} days ago`;
}

export function formatInviteExpiresIn(expiresAt: Timestamp | null): string {
  if (!expiresAt || typeof expiresAt.toMillis !== 'function') return '';
  const ms = expiresAt.toMillis();
  const days = Math.ceil((ms - Date.now()) / 86400000);
  if (days <= 0) return 'Expired';
  if (days === 1) return 'expires in 1 day';
  return `expires in ${days} days`;
}
