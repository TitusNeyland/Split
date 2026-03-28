import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@split/pending_invite_id';

/** Stored when a user opens an invite link before signing in; consumed after auth. */
export async function setPendingInviteId(inviteId: string | null): Promise<void> {
  if (!inviteId) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, inviteId);
}

export async function getPendingInviteId(): Promise<string | null> {
  const v = await AsyncStorage.getItem(KEY);
  return v && v.length > 0 ? v : null;
}
