/** Support inbox for mailto and server notifications. */
export const SUPPORT_EMAIL = 'support@mysplit.app';

export const SUPPORT_MAILTO_SUBJECT = 'mySplit Support Request';

/** Shown in profile footer (product name). */
export const APP_MARKETING_NAME = 'mySplit';

/**
 * If set, "FAQ & help center" opens in-app WebView instead of the native FAQ screen.
 * Example: https://help.example.com
 */
export const HELP_WEB_URL = (process.env.EXPO_PUBLIC_HELP_URL ?? '').trim();

/**
 * If set, "Terms, privacy & refund" opens this URL in WebView instead of bundled legal HTML.
 */
export const LEGAL_WEB_URL = (process.env.EXPO_PUBLIC_LEGAL_URL ?? '').trim();

export const PAYMENT_ISSUE_TYPES = [
  { value: 'wrong_amount', label: 'Wrong amount' },
  { value: 'not_received', label: 'Payment not received' },
  { value: 'duplicate_charge', label: 'Duplicate charge' },
  { value: 'other', label: 'Other' },
] as const;

export type PaymentIssueTypeValue = (typeof PAYMENT_ISSUE_TYPES)[number]['value'];

export const SUBSCRIPTION_CHOICES = [
  { value: 'free', label: 'Free plan' },
  { value: 'plus', label: 'Plus' },
  { value: 'premium', label: 'Premium' },
  { value: 'other', label: 'Other / not listed' },
] as const;
