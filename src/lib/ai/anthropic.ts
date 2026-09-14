import Anthropic from "@anthropic-ai/sdk";

import type { AIProvider, GenerateOptions, GenerationChunk } from "./types";

/**
 * Real generations via the Anthropic Messages API.
 *
 * The API requires strictly alternating user/assistant turns starting with a
 * user turn, so `normalizeTurns` merges and pads before sending.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(options: GenerateOptions): AsyncGenerator<GenerationChunk> {
    const messages = normalizeTurns(options.messages);
    try {
      const stream = this.client.messages.stream(
        {
          model: options.model,
          max_tokens: options.maxTokens,
          temperature: Math.min(1, options.temperature),
          system: options.system,
          messages,
        },
        { signal: options.signal },
      );

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta" &&
          event.delta.text
        ) {
          yield { type: "text", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      yield {
        type: "done",
        tokensIn: final.usage?.input_tokens ?? 0,
        tokensOut: final.usage?.output_tokens ?? 0,
        finishReason: final.stop_reason ?? undefined,
      };
    } catch (error) {
      if (options.signal?.aborted) {
        yield { type: "done", finishReason: "aborted" };
        return;
      }
      yield { type: "error", message: describeError(error) };
    }
  }

  async complete(options: GenerateOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: Math.min(1, options.temperature),
      system: options.system,
      messages: normalizeTurns(options.messages),
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401) return "The configured API key was rejected. Check ANTHROPIC_API_KEY.";
    if (error.status === 429) return "Rate limited by the model provider. Try again in a moment.";
    if (error.status === 529) return "The model is overloaded right now. Try again in a moment.";
    return `Model provider error (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unknown generation error.";
}

/**
 * Collapses consecutive same-role turns and guarantees the sequence starts
 * with a user turn — both are hard requirements of the Messages API, and
 * either can be violated by editing or deleting messages mid-chat.
 */
export function normalizeTurns(turns: { role: "user" | "assistant"; content: string }[]) {
  const cleaned = turns
    .map((t) => ({ role: t.role, content: t.content.trim() }))
    .filter((t) => t.content.length > 0);

  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of cleaned) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
  }

  if (merged.length === 0 || merged[0].role !== "user") {
    merged.unshift({ role: "user", content: "(Begin the scene.)" });
  }
  return merged;
}
