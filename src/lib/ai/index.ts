import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { getModel, type ModelVendor } from "../constants";
import type { AIProvider } from "./types";

export * from "./types";

const cache = new Map<string, AIProvider>();

function apiKeyFor(vendor: ModelVendor): string | undefined {
  const key = vendor === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return key?.trim() || undefined;
}

function build(vendor: ModelVendor): AIProvider {
  const key = apiKeyFor(vendor);
  if (!key) return new MockProvider();
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
export function getProviderForModel(modelId: string | null | undefined): AIProvider {
  if (process.env.AI_PROVIDER?.toLowerCase() === "mock") {
    return cached("mock", () => new MockProvider());
  }
  const vendor = getModel(modelId).vendor;
  return cached(vendor, () => build(vendor));
}

function cached(key: string, make: () => AIProvider): AIProvider {
  const existing = cache.get(key);
  if (existing) return existing;
  const made = make();
  cache.set(key, made);
  return made;
}

/** True when no vendor has a key, so every reply comes from the stand-in. */
export function isMockProvider(): boolean {
  if (process.env.AI_PROVIDER?.toLowerCase() === "mock") return true;
  return !apiKeyFor("anthropic") && !apiKeyFor("gemini");
}

/** Which vendors are actually configured, for the settings UI. */
export function configuredVendors(): ModelVendor[] {
  if (process.env.AI_PROVIDER?.toLowerCase() === "mock") return [];
  return (["anthropic", "gemini"] as const).filter((v) => Boolean(apiKeyFor(v)));
}

/** Test seam — drops memoised providers so env changes take effect. */
export function resetProvider(): void {
  cache.clear();
}
