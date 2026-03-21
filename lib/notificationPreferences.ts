/**
 * Stored at Firestore `users/{uid}.notificationPreferences`.
 * Check these flags before sending push via FCM (Cloud Function or backend).
 */
export const NOTIFICATION_PREF_KEYS = [
  'upcomingRenewals',
  'paymentReceived',
  'paymentFailed',
  'splitChanges',
  'autoReminders',
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  upcomingRenewals: true,
  paymentReceived: true,
  paymentFailed: true,
  splitChanges: true,
  autoReminders: false,
};

export function mergeNotificationPreferences(
  partial?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...partial };
}

/**
 * Use in the FCM sender (e.g. Cloud Function) after loading `users/{uid}.notificationPreferences`.
 */
export function isNotificationEnabled(
  partial: Partial<NotificationPreferences> | null | undefined,
  key: NotificationPreferenceKey
): boolean {
  return mergeNotificationPreferences(partial)[key];
}
