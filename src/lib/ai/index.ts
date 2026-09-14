import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AIProvider } from "./types";

export * from "./types";

let cached: AIProvider | null = null;

/**
 * Picks the provider from the environment.
 *
 * AI_PROVIDER forces a choice; otherwise we use Anthropic when a key is
 * present and fall back to the offline mock so a fresh clone still runs.
 */
export function getProvider(): AIProvider {
  if (cached) return cached;

  const forced = process.env.AI_PROVIDER?.toLowerCase();
  const key = process.env.ANTHROPIC_API_KEY?.trim();

  if (forced === "mock") {
    cached = new MockProvider();
  } else if (forced === "anthropic" || (!forced && key)) {
    if (!key) {
      throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set.");
    }
    cached = new AnthropicProvider(key);
  } else {
    cached = new MockProvider();
  }

  return cached;
}

/** True when replies come from the offline stand-in, surfaced in the UI. */
export function isMockProvider(): boolean {
  return getProvider().name === "mock";
}

/** Test seam — drops the memoised provider so env changes take effect. */
export function resetProvider(): void {
  cached = null;
}
