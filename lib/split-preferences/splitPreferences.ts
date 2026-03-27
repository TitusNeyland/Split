/**
 * Stored at Firestore `users/{uid}.splitPreferences`.
 * Screens that create or edit splits should read merged prefs for defaults and confirmation.
 */
export const DEFAULT_SPLIT_METHODS = ['equal', 'customPercent', 'fixedDollar'] as const;
export type DefaultSplitMethod = (typeof DEFAULT_SPLIT_METHODS)[number];

export type SplitPreferences = {
  /** When true, show $ and % together on subscription cards, activity, receipts where applicable. */
  alwaysShowExactAmounts: boolean;
  /** When true, confirm before persisting split % or amount edits. */
  confirmBeforeSplitChanges: boolean;
  /** When true, new edits default to next billing cycle instead of current. */
  changesEffectiveNextCycle: boolean;
  /** Pre-selected method when creating a new subscription split. */
  defaultSplitMethod: DefaultSplitMethod;
};

export const DEFAULT_SPLIT_PREFERENCES: SplitPreferences = {
  alwaysShowExactAmounts: true,
  confirmBeforeSplitChanges: true,
  changesEffectiveNextCycle: true,
  defaultSplitMethod: 'equal',
};

function normalizeDefaultSplitMethod(raw: unknown): DefaultSplitMethod {
  if (raw === 'equal' || raw === 'customPercent' || raw === 'fixedDollar') return raw;
  return DEFAULT_SPLIT_PREFERENCES.defaultSplitMethod;
}

export function mergeSplitPreferences(
  partial?: Partial<SplitPreferences> | null
): SplitPreferences {
  return {
    alwaysShowExactAmounts:
      partial?.alwaysShowExactAmounts ?? DEFAULT_SPLIT_PREFERENCES.alwaysShowExactAmounts,
    confirmBeforeSplitChanges:
      partial?.confirmBeforeSplitChanges ?? DEFAULT_SPLIT_PREFERENCES.confirmBeforeSplitChanges,
    changesEffectiveNextCycle:
      partial?.changesEffectiveNextCycle ?? DEFAULT_SPLIT_PREFERENCES.changesEffectiveNextCycle,
    defaultSplitMethod: normalizeDefaultSplitMethod(partial?.defaultSplitMethod),
  };
}

export function defaultSplitMethodLabel(method: DefaultSplitMethod): string {
  switch (method) {
    case 'equal':
      return 'Equal';
    case 'customPercent':
      return 'Custom %';
    case 'fixedDollar':
      return 'Fixed $';
    default:
      return 'Equal';
  }
}

/** Sub-label under “Default split method” (matches spec copy per option). */
export function defaultSplitMethodSubLabel(method: DefaultSplitMethod): string {
  switch (method) {
    case 'equal':
      return 'Equal for new subscriptions';
    case 'customPercent':
      return 'Custom % for new subscriptions';
    case 'fixedDollar':
      return 'Fixed $ for new subscriptions';
    default:
      return 'Equal for new subscriptions';
  }
}
