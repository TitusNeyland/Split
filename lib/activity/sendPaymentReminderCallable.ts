import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase';

/**
 * Owner-only: writes `reminder_sent` / `reminder_received` activity events via Cloud Function.
 */
export async function sendPaymentReminderCallable(params: {
  subscriptionId: string;
  memberUid: string;
}): Promise<void> {
  const fns = getFirebaseFunctions();
  if (!fns) throw new Error('Firebase is not configured.');
  const fn = httpsCallable<{ subscriptionId: string; memberUid: string }, { ok?: boolean }>(
    fns,
    'sendPaymentReminder'
  );
  await fn(params);
}
