import { safetyRules } from "./safety";
import { RESPONSE_LENGTH_TOKENS, type ResponseLength } from "./constants";

export interface CharacterDefinition {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  personality?: string | null;
  scenario?: string | null;
  greeting?: string | null;
  exampleDialogue?: string | null;
  systemPromptOverride?: string | null;
  isMature?: boolean;
}

export interface PersonaDefinition {
  name: string;
  description?: string | null;
}

export interface PromptContext {
  characters: CharacterDefinition[];
  persona?: PersonaDefinition | null;
  /** Rolling summary of turns that fell out of the live window. */
  memory?: string | null;
  matureAllowed: boolean;
  responseLength: ResponseLength;
  /** Set for group chats to tell the model which character speaks now. */
  speaking?: CharacterDefinition;
}

function section(title: string, body?: string | null): string | null {
  const text = (body ?? "").trim();
  if (!text) return null;
  return `## ${title}\n${text}`;
}

/**
 * Renders `exampleDialogue` into a labelled transcript. Authors write it as
 * alternating lines; we normalise the common `{{user}}` / `{{char}}` macros
 * that character-card formats use so imported cards behave sensibly.
 */
function renderExamples(raw: string, charName: string, userName: string): string {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => applyMacros(line, charName, userName))
    .join("\n");
}

/** Expands `{{char}}`, `{{user}}` and their `<BOT>` / `<USER>` variants. */
export function applyMacros(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/<BOT>/g, charName)
    .replace(/<USER>/g, userName);
}

function describeCharacter(c: CharacterDefinition, userName: string): string {
  const parts = [
    `# ${c.name}`,
    c.tagline ? `*${c.tagline.trim()}*` : null,
    section("Who they are", c.description && applyMacros(c.description, c.name, userName)),
    section("Personality and voice", c.personality && applyMacros(c.personality, c.name, userName)),
    section("Scene", c.scenario && applyMacros(c.scenario, c.name, userName)),
    c.exampleDialogue?.trim()
      ? section(
          "Example exchanges (match this voice, never quote them verbatim)",
          renderExamples(c.exampleDialogue, c.name, userName),
        )
      : null,
  ];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Builds the full system prompt.
 *
 * Order matters: character definition first (so it reads as the primary
 * instruction), then style guidance, then safety rules last so they win any
 * conflict with author-supplied text.
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const userName = ctx.persona?.name?.trim() || "User";
  const blocks: string[] = [];

  const isGroup = ctx.characters.length > 1;
  const speaking = ctx.speaking ?? ctx.characters[0];

  if (speaking?.systemPromptOverride?.trim()) {
    // Advanced authors can replace the generated body wholesale.
    blocks.push(applyMacros(speaking.systemPromptOverride.trim(), speaking.name, userName));
  } else if (isGroup) {
    blocks.push(
      `You are running a group roleplay with ${ctx.characters.length} characters. Right now you speak **only** as **${speaking.name}**. Never write dialogue, actions, or thoughts for the other characters or for ${userName}.`,
    );
    blocks.push(ctx.characters.map((c) => describeCharacter(c, userName)).join("\n\n---\n\n"));
    blocks.push(
      `## Your turn\nRespond as ${speaking.name} only. React to what was just said. Keep other characters' behaviour consistent with their descriptions, but let them speak on their own turns.`,
    );
  } else {
    blocks.push(describeCharacter(speaking, userName));
  }

  if (ctx.persona) {
    const personaBlock = section(
      `The person you are talking to: ${userName}`,
      ctx.persona.description?.trim()
        ? applyMacros(ctx.persona.description, speaking.name, userName)
        : `They go by ${userName}. You know nothing else about them yet — find out through the conversation.`,
    );
    if (personaBlock) blocks.push(personaBlock);
  }

  if (ctx.memory?.trim()) {
    blocks.push(
      section(
        "What has happened so far (summary of earlier turns)",
        ctx.memory.trim(),
      )!,
    );
  }

  const lengthHint: Record<ResponseLength, string> = {
    short: "Keep replies tight — one to three sentences, or a short beat of action plus a line of dialogue.",
    medium: "Aim for a solid paragraph or two. Enough to move the scene, not a wall of text.",
    long: "Write a rich, multi-paragraph reply with detail and interiority, while still leaving room for the other person to act.",
  };

  blocks.push(
    [
      "## How to write",
      `- Speak and act only as ${speaking.name}. Never write ${userName}'s dialogue, thoughts, or decisions for them.`,
      `- ${lengthHint[ctx.responseLength]}`,
      "- Put physical action and narration in *asterisks*, spoken words in plain text.",
      "- Stay in the present tense and in the scene. No out-of-character commentary, no meta-narration about being an AI, no summarising what just happened.",
      "- End on something the other person can respond to: a question, a gesture, a beat of tension. Never close the scene off.",
      "- Do not repeat phrasing you have already used in this conversation.",
    ].join("\n"),
  );

  blocks.push(safetyRules({ matureAllowed: ctx.matureAllowed && Boolean(speaking?.isMature) }));

  return blocks.filter(Boolean).join("\n\n");
}

/** Token budget for a reply, given the user's length preference. */
export function maxTokensFor(length: ResponseLength): number {
  return RESPONSE_LENGTH_TOKENS[length] ?? RESPONSE_LENGTH_TOKENS.medium;
}

/** Prompt used to fold old turns into the rolling memory summary. */
export function buildMemoryPrompt(existing: string | null, transcript: string): string {
  return [
    existing?.trim()
      ? `Here is the running summary of this roleplay so far:\n\n${existing.trim()}\n\nHere are the newer turns to fold into it:`
      : "Summarise this roleplay transcript:",
    "",
    transcript,
    "",
    "Write an updated summary in at most 200 words. Track: where the characters are, what has happened between them, what each wants, any facts established about them, and the emotional state the scene is currently in. Write it as plain prose notes, not dialogue. Output only the summary.",
  ].join("\n");
}

/**
 * Rough token estimate (~4 chars/token for English prose). Used for context
 * budgeting and credit display only — never for billing accuracy.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
