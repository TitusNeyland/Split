import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './firebase';

export async function saveOnboardingStripePaymentMethodId(paymentMethodId: string): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth?.currentUser || !db) throw new Error('Not signed in.');
  await setDoc(
    doc(db, 'users', auth.currentUser.uid),
    {
      stripePaymentMethodId: paymentMethodId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
