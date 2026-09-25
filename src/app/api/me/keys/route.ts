import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { badRequest, json, route } from "@/lib/api";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { checkKey } from "@/lib/key-check";
import { apiKeySchema, apiKeyDeleteSchema } from "@/lib/validation";
import { configuredVendors } from "@/lib/ai";
import { MODEL_VENDORS, type ModelVendor } from "@/lib/constants";

export const runtime = "nodejs";
// Validation makes a real upstream call.
export const maxDuration = 30;

const COLUMN: Record<ModelVendor, "anthropicKeyEnc" | "geminiKeyEnc"> = {
  anthropic: "anthropicKeyEnc",
  gemini: "geminiKeyEnc",
};

/**
 * The caller's stored keys, as masked previews only.
 *
 * The plaintext key is never returned — not to the owner either. Once saved it
 * can be replaced or removed, never read back.
 */
export const GET = route(async () => {
  const viewer = await requireViewer();
  const row = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { anthropicKeyEnc: true, geminiKeyEnc: true },
  });

  const fromEnv = configuredVendors();

  const keys = MODEL_VENDORS.map((vendor) => {
    const plain = decryptSecret(row?.[COLUMN[vendor]] ?? null);
    return {
      vendor,
      configured: Boolean(plain),
      masked: plain ? maskSecret(plain) : null,
      /** True when the server itself has a key, used if the user sets none. */
      serverFallback: fromEnv.includes(vendor),
    };
  });

  return json({ keys });
});

/** Validates a key against the vendor, then stores it encrypted. */
export const PUT = route(async (request: Request) => {
  const viewer = await requireViewer();
  const { vendor, key } = apiKeySchema.parse(await request.json());

  const result = await checkKey(vendor, key);
  if (!result.ok) throw badRequest(result.message);

  await prisma.user.update({
    where: { id: viewer.id },
    data: { [COLUMN[vendor]]: encryptSecret(key.trim()) },
  });

  return json({ ok: true, vendor, masked: maskSecret(key), message: result.message });
});

export const DELETE = route(async (request: Request) => {
  const viewer = await requireViewer();
  const url = new URL(request.url);
  const { vendor } = apiKeyDeleteSchema.parse({ vendor: url.searchParams.get("vendor") });

  await prisma.user.update({
    where: { id: viewer.id },
    data: { [COLUMN[vendor]]: null },
  });

  return json({ ok: true, vendor });
});
