/** Same codes as legacy expo-firebase-recaptcha / CodedError for downstream handling. */
export class RecaptchaVerifierError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RecaptchaVerifierError';
    this.code = code;
  }
}
