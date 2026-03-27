import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../firebase';

export const ACQUISITION_SOURCE_IDS = [
  'friend_family',
  'online_ad',
  'app_store_search',
  'youtube_tiktok',
  'podcast',
  'influencer',
  'other',
] as const;

export type AcquisitionSourceId = (typeof ACQUISITION_SOURCE_IDS)[number];

export type AcquisitionOption = {
  id: AcquisitionSourceId;
  label: string;
};

export const ACQUISITION_OPTIONS: readonly AcquisitionOption[] = [
  { id: 'friend_family', label: 'Friend or family' },
  { id: 'online_ad', label: 'Online ad' },
  { id: 'app_store_search', label: 'App Store search' },
  { id: 'youtube_tiktok', label: 'YouTube / TikTok' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'influencer', label: 'Influencer' },
  { id: 'other', label: 'Other' },
];

/** Marketing attribution only — `users/{uid}.acquisitionSource`. */
export async function saveAcquisitionSourceToFirestore(source: AcquisitionSourceId): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  if (!auth?.currentUser || !db) return;
  await setDoc(
    doc(db, 'users', auth.currentUser.uid),
    {
      acquisitionSource: source,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
