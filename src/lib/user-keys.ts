import "server-only";

import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import type { ModelVendor } from "./constants";

/** A user's own model credentials, decrypted for one request. */
export type VendorKeys = Partial<Record<ModelVendor, string>>;

/**
 * Loads and decrypts the caller's stored API keys.
 *
 * Kept deliberately small and server-only: the decrypted values exist for the
 * duration of a generation and are never serialised into a response.
 */
export async function resolveUserKeys(userId: string): Promise<VendorKeys> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { anthropicKeyEnc: true, geminiKeyEnc: true },
  });
  if (!row) return {};

  const keys: VendorKeys = {};
  const anthropic = decryptSecret(row.anthropicKeyEnc);
  const gemini = decryptSecret(row.geminiKeyEnc);
  if (anthropic) keys.anthropic = anthropic;
  if (gemini) keys.gemini = gemini;
  return keys;
}

/** Which vendors this user has personally configured. */
export async function userConfiguredVendors(userId: string): Promise<ModelVendor[]> {
  const keys = await resolveUserKeys(userId);
  return (Object.keys(keys) as ModelVendor[]).filter((v) => Boolean(keys[v]));
}
