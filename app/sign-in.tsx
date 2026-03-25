import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getFirebaseAuth } from '../lib/firebase';
import { signInWithEmail, signUpWithEmail, signInWithApple } from '../lib/authProviders';

WebBrowser.maybeCompleteAuthSession();

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.12)',
  inputBg: '#FFFFFF',
  errorRed: '#E24B4A',
};

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getFirebaseAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google OAuth — requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  // EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in .env
  const [request, response, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri: makeRedirectUri({ scheme: 'split', path: 'oauth2redirect' }),
  });


  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (!auth || !id_token) return;
      setLoading(true);
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(() => router.replace('/'))
        .catch((e) => setError(friendlyError(e)))
        .finally(() => setLoading(false));
    }
  }, [response]);

  async function handleEmailAuth() {
    if (!auth) return;
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(auth, email.trim(), password);
      } else {
        await signUpWithEmail(auth, email.trim(), password);
      }
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    if (!auth) return;
    setError(null);
    setLoading(true);
    try {
      await signInWithApple(auth);
      router.replace('/');
    } catch (e: any) {
      console.error('Apple sign-in error:', e?.code, e?.message);
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setError(friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    await promptGoogleAsync();
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Split</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={C.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={C.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={handleEmailAuth}
          disabled={loading || !email || !password}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnTxt}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerTxt}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
          onPress={handleGoogle}
          disabled={loading || !request}
        >
          <Text style={styles.socialBtnTxt}>Continue with Google</Text>
        </Pressable>

        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleBtn}
            onPress={handleApple}
          />
        )}

        <Pressable
          style={styles.switchModeBtn}
          onPress={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setError(null);
          }}
        >
          <Text style={styles.switchModeTxt}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(e: unknown): string {
  const code = (e as any)?.code ?? '';
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
    default: return 'Something went wrong. Please try again.';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  container: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: C.purple,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: C.muted,
    marginBottom: 32,
  },
  errorText: {
    fontSize: 14,
    color: C.errorRed,
    marginBottom: 12,
  },
  input: {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: C.purple,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  btnPressed: { opacity: 0.82 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerTxt: {
    fontSize: 14,
    color: C.muted,
  },
  socialBtn: {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  socialBtnTxt: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  appleBtn: {
    height: 50,
    marginBottom: 12,
  },
  switchModeBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchModeTxt: {
    fontSize: 15,
    color: C.purple,
  },
});
