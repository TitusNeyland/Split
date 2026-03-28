import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

function readEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    readEnv('EXPO_PUBLIC_FIREBASE_API_KEY') &&
      readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') &&
      readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID') &&
      readEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') &&
      readEnv('EXPO_PUBLIC_FIREBASE_APP_ID')
  );
}

/** Web + native Recaptcha (expo-firebase-recaptcha) config shape. */
export function getFirebaseWebOptions(): FirebaseOptions | null {
  if (!isFirebaseConfigured()) return null;
  return {
    apiKey: readEnv('EXPO_PUBLIC_FIREBASE_API_KEY')!,
    authDomain: readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN')!,
    projectId: readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID')!,
    storageBucket: readEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET')!,
    messagingSenderId: readEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ?? '',
    appId: readEnv('EXPO_PUBLIC_FIREBASE_APP_ID')!,
  };
}

let cachedApp: FirebaseApp | null | undefined;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (cachedApp !== undefined) return cachedApp;
  const opts = getFirebaseWebOptions();
  cachedApp =
    getApps().length > 0 ? getApp() : opts ? initializeApp(opts) : null;
  return cachedApp;
}

let cachedFirestore: Firestore | null | undefined;

let cachedAuth: Auth | null | undefined;

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (cachedAuth !== undefined) return cachedAuth;
  try {
    cachedAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch {
    // initializeAuth throws if already initialized; fall back to getAuth
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

/**
 * React Native / Expo often hit WebChannel `Listen` transport errors; long-polling is stable.
 * If Firestore was already initialized (e.g. hot reload), fall back to `getFirestore`.
 */
export function getFirebaseFirestore(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (cachedFirestore !== undefined) return cachedFirestore;
  try {
    cachedFirestore = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch {
    cachedFirestore = getFirestore(app);
  }
  return cachedFirestore;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}

/** Callable HTTPS functions (same region as `functions` deployment, e.g. `us-central1`). */
export function getFirebaseFunctions(region = 'us-central1'): Functions | null {
  const app = getFirebaseApp();
  return app ? getFunctions(app, region) : null;
}
