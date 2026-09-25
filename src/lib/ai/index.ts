import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { createHash } from "node:crypto";

import { getModel, type ModelVendor } from "../constants";
import type { AIProvider } from "./types";

export * from "./types";

/** A user's own credentials, taking precedence over the instance's env keys. */
export type VendorKeys = Partial<Record<ModelVendor, string>>;

// SDK clients are reusable, so cache one per distinct credential rather than
// rebuilding per request. Bounded, because the key space is per-user.
const cache = new Map<string, AIProvider>();
const MAX_CACHED = 64;

/** Short, non-reversible tag so a key never appears in a cache key verbatim. */
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function apiKeyFor(vendor: ModelVendor): string | undefined {
  const key = vendor === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return key?.trim() || undefined;
}

function build(vendor: ModelVendor, key: string): AIProvider {
  return vendor === "gemini" ? new GeminiProvider(key) : new AnthropicProvider(key);
}

/**
 * Resolves the provider that serves a given model id.
 *
 * Models span two vendors, so selection is per-model rather than global. A
 * vendor with no configured key falls back to the offline mock provider, which
 * keeps the whole product usable on a fresh clone.
 *
 * AI_PROVIDER=mock forces every model onto the mock provider, which is what
 * the test suite uses.
 */
export function getProviderForModel(
  modelId: string | null | undefined,
  userKeys?: VendorKeys,
): AIProvider {
  if (process.env.AI_PROVIDER?.toLowerCase() === "mock") {
    return cached("mock", () => new MockProvider());
  }

  const vendor = getModel(modelId).vendor;
  // The user's own key wins over the instance's, so someone can run entirely
  // on their own Gemini quota without the server holding a key at all.
  const key = userKeys?.[vendor]?.trim() || apiKeyFor(vendor);
  if (!key) return cached("mock", () => new MockProvider());

  return cached(`${vendor}:${fingerprint(key)}`, () => build(vendor, key));
}

function cached(key: string, make: () => AIProvider): AIProvider {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  // Simple bound: drop the oldest entry once the cache is full.
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const made = make();
  cache.set(key, made);
  return made;
}

/**
 * True when nothing is configured and every reply would come from the
 * stand-in. Pass the viewer's keys so a user with their own key is not told
 * the instance is offline.
 */
export function isMockProvider(userKeys?: VendorKeys): boolean {
  if (process.env.AI_PROVIDER?.toLowerCase() === "mock") return true;
  const has = (v: ModelVendor) => Boolean(userKeys?.[v]?.trim() || apiKeyFor(v));
  return !has("anthropic") && !has("gemini");
}

/** Which vendors the instance itself has configured, for the settings UI. */
export function configuredVendors(): ModelVendor[] {
  if (process.env.AI_PROVIDER?.toLowerCase() === "mock") return [];
  return (["anthropic", "gemini"] as const).filter((v) => Boolean(apiKeyFor(v)));
}

/** Test seam — drops memoised providers so env changes take effect. */
export function resetProvider(): void {
  cache.clear();
}
