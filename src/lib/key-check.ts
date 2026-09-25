import "server-only";

import { AnthropicProvider } from "./ai/anthropic";
import { GeminiProvider } from "./ai/gemini";
import type { ModelVendor } from "./constants";

export interface KeyCheckResult {
  ok: boolean;
  /** Safe to show the user verbatim. */
  message: string;
}

/**
 * Confirms a key works before we store it.
 *
 * Costs one tiny generation, which is worth it: a typo'd key otherwise fails
 * silently later, mid-conversation, looking like the app is broken.
 */
export async function checkKey(vendor: ModelVendor, key: string): Promise<KeyCheckResult> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: "That key is empty." };

  const model = vendor === "gemini" ? "gemini-2.5-flash" : "claude-haiku-4-5-20251001";
  const provider =
    vendor === "gemini" ? new GeminiProvider(trimmed) : new AnthropicProvider(trimmed);

  try {
    // A real call is the only honest test; the shape of a key proves nothing.
    const text = await provider.complete({
      system: "Reply with the single word: ok",
      messages: [{ role: "user", content: "ping" }],
      model,
      temperature: 0,
      maxTokens: 8,
    });

    return text.trim().length > 0
      ? { ok: true, message: "Key works." }
      : { ok: false, message: "The provider accepted the key but returned nothing. Try again." };
  } catch (error) {
    return { ok: false, message: describe(vendor, error) };
  }
}

function describe(vendor: ModelVendor, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/API key not valid|API_KEY_INVALID|invalid.*api.*key|401|authentication/i.test(raw)) {
    return vendor === "gemini"
      ? "Google rejected that key. Check you copied it whole from aistudio.google.com/apikey."
      : "Anthropic rejected that key. Check you copied it whole from console.anthropic.com.";
  }
  if (/403|permission|PERMISSION_DENIED/i.test(raw)) {
    return "That key was rejected for lacking permission. Check it has access to the model API.";
  }
  if (/429|quota|RESOURCE_EXHAUSTED|rate/i.test(raw)) {
    return "The key is valid but is currently rate limited or out of quota.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|timeout/i.test(raw)) {
    return "Couldn't reach the provider to check the key. Check your connection and try again.";
  }
  // Don't echo the raw provider error: it can contain the submitted key.
  return "That key didn't work. Double-check it and try again.";
}
