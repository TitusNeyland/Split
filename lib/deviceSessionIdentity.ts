import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'split_auth_device_session_id';

function randomSessionId(): string {
  const u = globalThis.crypto?.randomUUID?.();
  if (u) return u;
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Stable per-install id used as `users/{uid}/sessions/{sessionId}` document id. */
export async function getOrCreateDeviceSessionId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(STORAGE_KEY);
  if (existing) return existing;
  const id = randomSessionId();
  await SecureStore.setItemAsync(STORAGE_KEY, id);
  return id;
}
