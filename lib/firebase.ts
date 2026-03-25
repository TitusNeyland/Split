import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, type Firestore } from 'firebase/firestore';
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

export function getFirebaseFirestore(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}
