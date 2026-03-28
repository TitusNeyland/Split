import { sha256 } from 'js-sha256';

/** SHA-256 hex (lowercase) of UTF-8 string — matches Node `crypto.createHash('sha256')` for E.164. */
export function sha256HexUtf8Js(value: string): string {
  return sha256(value);
}
