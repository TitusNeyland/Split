/**
 * Stored at Firestore `users/{uid}.privacySettings`.
 * Enforce visibility in security rules and when writing activity / friend-balance reads.
 */
export type PrivacySettings = {
  /** When true, group members see this user’s payments in shared activity feeds. */
  activityVisibleToGroup: boolean;
  /** When true, friends may see this user’s net balance in profile / friend views. */
  showBalanceToFriends: boolean;
  /**
   * When true, others may find this account via display-name search (prefix match).
   * Email search uses exact match and is unaffected.
   */
  discoverableByName: boolean;
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  activityVisibleToGroup: true,
  showBalanceToFriends: false,
  discoverableByName: true,
};

export function mergePrivacySettings(
  partial?: Partial<PrivacySettings> | null
): PrivacySettings {
  return {
    activityVisibleToGroup:
      partial?.activityVisibleToGroup ?? DEFAULT_PRIVACY_SETTINGS.activityVisibleToGroup,
    showBalanceToFriends:
      partial?.showBalanceToFriends ?? DEFAULT_PRIVACY_SETTINGS.showBalanceToFriends,
    discoverableByName:
      partial?.discoverableByName ?? DEFAULT_PRIVACY_SETTINGS.discoverableByName,
  };
}
