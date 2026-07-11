import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Helpers for onboarding education-portal students: friendly temporary
 * passwords, hashed single-use invite tokens, and the shared password hash.
 * Server-only (imported by the students server actions + auth flows). NOT a
 * "use server" module — these are pure functions, not callable endpoints.
 */

// Farm-themed words for a memorable temp password that's easy to read out or
// relay over WhatsApp. Ambiguity-free (no words that look alike).
const WORDS = [
  "Melon", "Panen", "Kebun", "Benih", "Hijau", "Manis",
  "Tumbuh", "Segar", "Pupuk", "Bibit", "Petani", "Ladang",
];

/** e.g. "Melon4821" — one word + 4 digits (>= 6 chars, meets the min). */
export function generateTempPassword(): string {
  const word = WORDS[crypto.randomInt(WORDS.length)];
  const digits = crypto.randomInt(1000, 10000);
  return `${word}${digits}`;
}

/** Invite token: a high-entropy random string emailed to the student, stored
 *  only as a SHA-256 hash (so a DB leak can't be used to hijack invites). */
export function generateInviteToken(ttlDays = 14): {
  token: string;
  hash: string;
  expiry: Date;
} {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = hashInviteToken(token);
  const expiry = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  return { token, hash, expiry };
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** Slug a name into the local-part of a synthetic login email for students
 *  who have no email address (login is still email-shaped for Auth.js). */
export function synthLoginLocalPart(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  return (base || "siswa") + crypto.randomInt(1000, 10000);
}

/** The domain used for synthetic (email-less) student logins. */
export const SYNTH_LOGIN_DOMAIN = "siswa.sparmanik.farm";
