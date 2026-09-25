import { GoogleGenAI, type Content } from "@google/genai";

import { normalizeTurns } from "./anthropic";
import type { AIProvider, GenerateOptions, GenerationChunk } from "./types";

/**
 * Google Gemini, via the official @google/genai SDK.
 *
 * Gemini needs the same alternating user/model turn sequence Anthropic does,
 * so the shared `normalizeTurns` helper runs first and the roles are then
 * mapped ("assistant" -> "model", which is Gemini's spelling).
 *
 * Get a key from https://aistudio.google.com/apikey — the free tier is enough
 * to run this app. Note that a Gemini Advanced / Google One AI Premium
 * subscription is a *consumer product* and does not grant API access; the key
 * is separate and is what this provider needs.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *stream(options: GenerateOptions): AsyncGenerator<GenerationChunk> {
    try {
      const stream = await this.client.models.generateContentStream({
        model: options.model,
        contents: toContents(options),
        config: {
          systemInstruction: options.system,
          temperature: Math.min(2, options.temperature),
          maxOutputTokens: options.maxTokens,
          abortSignal: options.signal,
        },
      });

      let tokensIn = 0;
      let tokensOut = 0;
      let finishReason: string | undefined;

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield { type: "text", text };

        // Usage arrives on the trailing chunks; keep the latest values.
        if (chunk.usageMetadata) {
          tokensIn = chunk.usageMetadata.promptTokenCount ?? tokensIn;
          tokensOut = chunk.usageMetadata.candidatesTokenCount ?? tokensOut;
        }
        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason) finishReason = String(reason);
      }

      yield { type: "done", tokensIn, tokensOut, finishReason };
    } catch (error) {
      if (options.signal?.aborted) {
        yield { type: "done", finishReason: "aborted" };
        return;
      }
      yield { type: "error", message: describeError(error) };
    }
  }

  async complete(options: GenerateOptions): Promise<string> {
    const response = await this.client.models.generateContent({
      model: options.model,
      contents: toContents(options),
      config: {
        systemInstruction: options.system,
        temperature: Math.min(2, options.temperature),
        maxOutputTokens: options.maxTokens,
      },
    });
    return (response.text ?? "").trim();
  }
}

/** Maps our neutral turn list onto Gemini's Content array. */
function toContents(options: GenerateOptions): Content[] {
  return normalizeTurns(options.messages).map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/API key not valid|API_KEY_INVALID|401/i.test(message)) {
    return "Google rejected the API key. Check GEMINI_API_KEY (get one at aistudio.google.com/apikey).";
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return "Gemini rate limit or quota reached. Wait a moment, or check your quota in Google AI Studio.";
  }
  if (/SAFETY|blocked/i.test(message)) {
    return "Gemini blocked that response under its safety filters. Try rephrasing the scene.";
  }
  if (/503|overloaded|UNAVAILABLE/i.test(message)) {
    return "Gemini is overloaded right now. Try again in a moment.";
  }
  return `Gemini error: ${message}`;
}
