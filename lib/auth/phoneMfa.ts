import type { Auth, MultiFactorError, MultiFactorResolver, User } from 'firebase/auth';
import {
  EmailAuthProvider,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  reauthenticateWithCredential,
  type ApplicationVerifier,
} from 'firebase/auth';

export function isMultiFactorAuthRequiredError(error: unknown): error is MultiFactorError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as MultiFactorError).code === 'auth/multi-factor-auth-required'
  );
}

export function getPhoneMfaResolver(auth: Auth, error: unknown): MultiFactorResolver | null {
  if (!isMultiFactorAuthRequiredError(error)) return null;
  return getMultiFactorResolver(auth, error);
}

/** Send SMS for sign-in / re-auth when Firebase returns `auth/multi-factor-auth-required`. */
export async function startPhoneMfaResolverSms(
  auth: Auth,
  resolver: MultiFactorResolver,
  applicationVerifier: ApplicationVerifier
): Promise<string> {
  const hint = resolver.hints[0];
  if (!hint || hint.factorId !== 'phone') {
    throw new Error('SMS verification is required but no phone second factor was found.');
  }
  const provider = new PhoneAuthProvider(auth);
  return provider.verifyPhoneNumber(
    { multiFactorHint: hint, session: resolver.session },
    applicationVerifier
  );
}

export async function completeMfaResolverSignIn(
  resolver: MultiFactorResolver,
  verificationId: string,
  smsCode: string
): Promise<void> {
  const cred = PhoneAuthProvider.credential(verificationId, smsCode.trim());
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  await resolver.resolveSignIn(assertion);
}

export function userHasPasswordProvider(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password');
}

export function getEnrolledPhoneFactor(user: User) {
  const factors = multiFactor(user).enrolledFactors;
  return factors.find((f) => f.factorId === 'phone') ?? null;
}

export function isPhoneMfaEnrolled(user: User): boolean {
  return getEnrolledPhoneFactor(user) != null;
}

export async function startPhoneMfaEnrollment(
  auth: Auth,
  user: User,
  phoneNumberE164: string,
  applicationVerifier: ApplicationVerifier
): Promise<string> {
  const session = await multiFactor(user).getSession();
  const provider = new PhoneAuthProvider(auth);
  return provider.verifyPhoneNumber(
    { phoneNumber: phoneNumberE164, session },
    applicationVerifier
  );
}

export async function completePhoneMfaEnrollment(
  user: User,
  verificationId: string,
  smsCode: string
): Promise<void> {
  const cred = PhoneAuthProvider.credential(verificationId, smsCode);
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  await multiFactor(user).enroll(assertion);
}

export async function reauthenticateWithEmailPassword(
  user: User,
  email: string,
  password: string
): Promise<void> {
  const cred = EmailAuthProvider.credential(email.trim(), password);
  await reauthenticateWithCredential(user, cred);
}

export async function unenrollPhoneMfa(user: User): Promise<void> {
  const factor = getEnrolledPhoneFactor(user);
  if (!factor) throw new Error('SMS two-factor is not enabled.');
  await multiFactor(user).unenroll(factor);
}
