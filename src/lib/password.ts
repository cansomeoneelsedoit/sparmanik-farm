import { randomBytes } from "node:crypto";

/**
 * Generate a random one-time password for a freshly provisioned account.
 * Replaces the old shared static default (app review #4, #13). Returned to the
 * admin once at creation; never stored in plaintext or in the audit log.
 *
 * Alphanumeric only (no ambiguous punctuation) so it's easy to read aloud/type
 * on a tablet, with mixed case + digits for a reasonable one-time secret.
 */
export function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
