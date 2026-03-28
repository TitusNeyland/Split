import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';
import type { PaymentIssuePayload } from './submitPaymentIssueApi';

/** Client fallback when the API server is unavailable (requires Firestore rules on <code>support_requests</code>). */
export async function submitPaymentIssueToFirestore(
  uid: string,
  userEmail: string | null,
  body: PaymentIssuePayload
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await addDoc(collection(db, 'support_requests'), {
    kind: 'payment_issue',
    uid,
    userEmail,
    subscription: body.subscription,
    issueType: body.issueType,
    description: body.description,
    createdAt: serverTimestamp(),
    source: 'client_fallback',
  });
}
