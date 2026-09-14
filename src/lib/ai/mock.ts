import type { AIProvider, GenerateOptions, GenerationChunk } from "./types";

/**
 * Offline stand-in model.
 *
 * Selected automatically when no ANTHROPIC_API_KEY is configured so the whole
 * product — streaming, regeneration, swipes, memory, credits — can be
 * exercised with no network and no cost. Output is deterministic for a given
 * conversation, which also makes it usable as a test fixture.
 *
 * It is a text generator, not a language model: it reflects the character name
 * and the user's last line back through a small set of roleplay beats.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async *stream(options: GenerateOptions): AsyncGenerator<GenerationChunk> {
    const reply = composeReply(options);
    // Emit in word groups so the client's streaming path is genuinely exercised.
    const tokens = reply.match(/\S+\s*/g) ?? [reply];
    for (let i = 0; i < tokens.length; i += 2) {
      if (options.signal?.aborted) {
        yield { type: "done", finishReason: "aborted" };
        return;
      }
      yield { type: "text", text: tokens.slice(i, i + 2).join("") };
      await sleep(18);
    }
    yield {
      type: "done",
      tokensIn: Math.ceil((options.system.length + options.messages.reduce((n, m) => n + m.content.length, 0)) / 4),
      tokensOut: Math.ceil(reply.length / 4),
      finishReason: "end_turn",
    };
  }

  async complete(options: GenerateOptions): Promise<string> {
    // Used for summaries and titles; keep it short and structural.
    const lastUser = [...options.messages].reverse().find((m) => m.role === "user");
    if (options.system.includes("title")) {
      return titleFrom(lastUser?.content ?? "New chat");
    }
    return composeReply(options);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small deterministic string hash, so the same input always replays. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

/** Pulls the character name out of the generated system prompt's heading. */
function characterNameFrom(system: string): string {
  const speakOnly = system.match(/speak \*\*only\*\* as \*\*(.+?)\*\*/);
  if (speakOnly) return speakOnly[1];
  const heading = system.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : "They";
}

const OPENERS = [
  "*glances up, caught mid-thought*",
  "*leans back, considering that for a moment*",
  "*a slow smile, the kind that doesn't quite reach the eyes*",
  "*sets down what they were holding and turns properly toward you*",
  "*exhales, some of the tension going out of their shoulders*",
  "*tilts their head, studying you*",
];

const MIDDLES = [
  "You have a way of asking things sideways, you know that?",
  "That's not the question you actually came here to ask.",
  "Fine. I'll bite.",
  "Hm. That's more interesting than you meant it to be.",
  "You always do this — you wait until I'm halfway out the door.",
  "I've been turning that over myself, honestly.",
];

const CLOSERS = [
  "*a beat of silence, then* So. Your move.",
  "*watches you, waiting* Well? Don't leave me hanging.",
  "*steps closer, voice dropping* Tell me what you're really after.",
  "*gestures at the seat across from them* Sit. This'll take a minute.",
  "*raises an eyebrow* And? There's more, isn't there.",
];

function composeReply(options: GenerateOptions): string {
  const name = characterNameFrom(options.system);
  const lastUser = [...options.messages].reverse().find((m) => m.role === "user");
  const said = (lastUser?.content ?? "").trim();
  const seed = hash(said + options.messages.length + name);

  const wantsLong = options.maxTokens > 800;
  const wantsShort = options.maxTokens < 300;

  const echo = said
    ? `"${said.replace(/\s+/g, " ").slice(0, 120)}${said.length > 120 ? "…" : ""}" *— they repeat it back, turning the words over.*`
    : "*The quiet stretches between you.*";

  const parts = [pick(OPENERS, seed), pick(MIDDLES, seed >> 3)];
  if (!wantsShort) parts.push(echo);
  if (wantsLong) {
    parts.push(
      `*${name} is quiet for a moment longer than is comfortable, and when they speak again it's lower.* There's a version of this where I tell you everything and we both regret it. And there's a version where I don't, and you leave, and we both regret that instead. *A short, humourless laugh.* Pick your poison.`,
    );
  }
  parts.push(pick(CLOSERS, seed >> 6));

  const note = "\n\n*(Offline demo model — set ANTHROPIC_API_KEY in .env for real replies.)*";
  return parts.join("\n\n") + note;
}

function titleFrom(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
  return words ? words.replace(/[.,!?]+$/, "") : "New chat";
}
