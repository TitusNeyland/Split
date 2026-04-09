/** Resolved profile image URL from a user doc (`photoURL` is canonical; `avatarUrl` is legacy). */
export function userDocPhotoUrl(d: Record<string, unknown> | null | undefined): string | null {
  if (!d) {
    return null;
  }
  const p =
    typeof d.avatarUrl === 'string' && d.avatarUrl.trim()
      ? d.avatarUrl.trim()
      : typeof d.photoURL === 'string' && d.photoURL.trim()
        ? d.photoURL.trim()
        : null;
  return p;
}
