import * as Linking from 'expo-linking';

/** Public web origin for invite deep links (no trailing slash). */
export function getInviteBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_INVITE_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : 'https://mysplit.app').replace(/\/$/, '');
}

export function buildInviteUrl(inviteId: string): string {
  return `${getInviteBaseUrl()}/invite/${inviteId}`;
}

export function buildInviteShareMessage(inviteId: string): string {
  const url = buildInviteUrl(inviteId);
  return `Hey, join me on mySplit to split subscriptions and bills together: ${url}`;
}

const INVITE_PATH = /\/invite\/([^/?#]+)/i;

/**
 * Parses invite id from universal links, custom scheme, or Expo dev URLs.
 */
export function extractInviteIdFromUrl(url: string): string | null {
  if (!url) return null;
  const direct = url.match(INVITE_PATH);
  if (direct?.[1]) return direct[1];

  try {
    const parsed = Linking.parse(url);
    const path = (parsed.path ?? '').replace(/^\//, '');
    const fromPath = path.match(/^invite\/([^/?#]+)/i);
    if (fromPath?.[1]) return fromPath[1];
  } catch {
    /* ignore */
  }

  return null;
}
