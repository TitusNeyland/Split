import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/**
 * Finalised payments document schema.
 *
 * Fields set at creation time (by Cloud Function / server):
 *   owner      — uid of the subscription owner (bill payer)
 *   payer      — uid of the member who owes the share
 *   recipient  — uid of whoever collects the share
 *   status     — 'pending' | 'paid' | 'overdue'
 *   partial_amount — amount already paid toward total (0 if none)
 *
 * Fields added when manually settled (written here):
 *   status           — updated to 'paid'
 *   settlementMethod — 'venmo' | 'cash' | 'in-app' | 'manual'
 *   note             — optional free-text note from recorder
 *   recordedBy       — uid of user who recorded the settlement
 *   timestamp        — Firestore server timestamp of settlement
 */
export async function recordManualSettlement(
  paymentId: string,
  recordedBy: string,
  note: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firebase is not configured.');
  await updateDoc(doc(db, 'payments', paymentId), {
    status: 'paid',
    settlementMethod: 'manual',
    note,
    recordedBy,
    timestamp: serverTimestamp(),
  });
}
