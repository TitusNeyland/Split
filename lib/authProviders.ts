import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  OAuthProvider,
  type Auth,
} from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export async function signInWithEmail(
  auth: Auth,
  email: string,
  password: string,
) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(
  auth: Auth,
  email: string,
  password: string,
) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Native Apple Sign-In (iOS 13+).
 * Requires expo-apple-authentication and expo-crypto.
 * Enable "Sign in with Apple" capability in Firebase Console → Authentication → Sign-in method.
 */
export async function signInWithApple(auth: Auth) {
  const nonce = Array.from(Crypto.getRandomBytes(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple sign-in failed: no identity token returned.');
  }

  const provider = new OAuthProvider('apple.com');
  const oauthCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce: nonce,
  });

  return signInWithCredential(auth, oauthCredential);
}
