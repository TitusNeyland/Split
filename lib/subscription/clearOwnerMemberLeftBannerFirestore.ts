import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase';

/** Owner dismisses the "member left" amber banner. */
export async function clearOwnerMemberLeftBanner(subscriptionId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');
  await updateDoc(doc(db, 'subscriptions', subscriptionId), {
    ownerMemberLeftBanner: deleteField(),
  });
}
