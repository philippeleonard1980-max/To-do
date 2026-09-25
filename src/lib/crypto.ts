import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption for user-supplied API keys at rest.
 *
 * These are other people's credentials sitting in our database, so they are
 * never stored in plaintext and never leave the server. AES-256-GCM gives
 * authenticated encryption, so a tampered ciphertext fails to decrypt rather
 * than silently yielding garbage.
 *
 * The key is derived from AUTH_SECRET. Rotating AUTH_SECRET therefore
 * invalidates every stored API key — `decryptSecret` returns null in that
 * case and the user simply re-enters theirs, which is the right failure mode.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short; cannot encrypt stored API keys.");
  }
  // A fixed salt is fine here: the input is already a high-entropy secret, and
  // a per-record salt would have to be stored alongside anyway.
  cachedKey = scryptSync(secret, "aitalk.apikeys.v1", 32);
  return cachedKey;
}

/** Encrypts a secret for storage. Output is `iv.tag.ciphertext`, base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Reverses `encryptSecret`. Returns null for anything unreadable. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;

  try {
    const [ivPart, tagPart, dataPart] = stored.split(".");
    if (!ivPart || !tagPart || !dataPart) return null;

    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong AUTH_SECRET, tampering, or a corrupt row. Treat as "no key".
    return null;
  }
}

/**
 * A safe preview for the UI: enough to recognise which key is stored, not
 * enough to use it. Never send the real value to a client.
 */
export function maskSecret(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Test seam — drops the derived key so an AUTH_SECRET change takes effect. */
export function resetEncryptionKey(): void {
  cachedKey = null;
}
