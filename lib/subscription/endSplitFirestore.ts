import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase';

export async function endSubscriptionSplit(params: {
  subscriptionId: string;
  endedByUid: string;
  ownerDisplayName: string;
  subscriptionDisplayName: string;
  /** Uids to notify (other members); excludes inviter / owner. */
  recipientUids: string[];
}): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore is not configured.');

  await updateDoc(doc(db, 'subscriptions', params.subscriptionId), {
    status: 'ended',
    endedAt: serverTimestamp(),
    endedBy: params.endedByUid,
  });

  const fns = getFirebaseFunctions();
  if (!fns || params.recipientUids.length === 0) return;

  const title = `${params.ownerDisplayName} ended the ${params.subscriptionDisplayName} split`;
  try {
    const notify = httpsCallable<
      { subscriptionId: string; recipientUids: string[]; title: string; body: string },
      unknown
    >(fns, 'notifySplitEnded');
    await notify({
      subscriptionId: params.subscriptionId,
      recipientUids: params.recipientUids,
      title,
      body: title,
    });
  } catch (e) {
    // Callable may not be deployed (`functions/not-found`); subscription still ended.
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code !== 'functions/not-found') {
      console.warn('notifySplitEnded:', e);
    }
  }
}
