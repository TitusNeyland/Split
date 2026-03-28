import { deleteDoc, doc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

export async function deleteSubscriptionDocument(subscriptionId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await deleteDoc(doc(db, 'subscriptions', subscriptionId));
}
