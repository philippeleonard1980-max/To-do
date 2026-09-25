import "server-only";

import { prisma } from "./db";
import { getProviderForModel } from "./ai";
import { parseJson } from "./json";
import { forbidden, notFound } from "./api";
import {
  DEFAULT_MODEL,
  PLAN_LIMITS,
  RESPONSE_LENGTHS,
  getModel,
  planAllowsModel,
  type Plan,
  type ResponseLength,
} from "./constants";
import type { Viewer } from "./auth";
import {
  buildMemoryPrompt,
  buildSystemPrompt,
  estimateTokens,
  maxTokensFor,
  type CharacterDefinition,
} from "./prompt";
import type { ChatTurn } from "./ai/types";
import { labelGroupTurns, pickSpeaker, windowTurns } from "./turns";

export interface ChatSettings {
  model: string;
  temperature: number;
  responseLength: ResponseLength;
}

/** Chat-level overrides fall back to the viewer's global preferences. */
export function resolveChatSettings(raw: string | null, viewer: Viewer): ChatSettings {
  const stored = parseJson<Partial<ChatSettings>>(raw, {});
  const model = stored.model ?? viewer.settings.model ?? DEFAULT_MODEL;
  const responseLength = RESPONSE_LENGTHS.includes(stored.responseLength as ResponseLength)
    ? (stored.responseLength as ResponseLength)
    : viewer.settings.responseLength;

  return {
    // Silently downgrade rather than erroring if a plan lapsed after the
    // chat was configured with a higher-tier model.
    model: planAllowsModel(viewer.plan, model) ? model : DEFAULT_MODEL,
    temperature:
      typeof stored.temperature === "number"
        ? Math.min(1.5, Math.max(0, stored.temperature))
        : viewer.settings.temperature,
    responseLength,
  };
}

const chatInclude = {
  participants: { include: { character: true }, orderBy: { order: "asc" } },
  persona: true,
} as const;

export type LoadedChat = Awaited<ReturnType<typeof loadChat>>;

export async function loadChat(chatId: string, viewer: Viewer) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: chatInclude });
  if (!chat) throw notFound("That chat doesn't exist.");
  if (chat.userId !== viewer.id) throw forbidden("That chat belongs to someone else.");
  return chat;
}

/** Messages with their active variant resolved, ordered oldest first. */
export async function loadMessages(chatId: string) {
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { position: "asc" },
    include: { variants: { orderBy: { index: "asc" } } },
  });

  return messages.map((m) => {
    const active = m.variants.find((v) => v.index === m.activeVariant) ?? m.variants[0] ?? null;
    return {
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      characterId: m.characterId,
      authorName: m.authorName,
      position: m.position,
      createdAt: m.createdAt,
      content: active?.content ?? "",
      activeVariant: m.activeVariant,
      variantCount: m.variants.length,
      model: active?.model ?? null,
      finishReason: active?.finishReason ?? null,
    };
  });
}

export type ResolvedMessage = Awaited<ReturnType<typeof loadMessages>>[number];

export function toDefinition(character: {
  id: string;
  name: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  greeting: string;
  exampleDialogue: string;
  systemPromptOverride: string | null;
  isMature: boolean;
}): CharacterDefinition {
  return {
    id: character.id,
    name: character.name,
    tagline: character.tagline,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
    greeting: character.greeting,
    exampleDialogue: character.exampleDialogue,
    systemPromptOverride: character.systemPromptOverride,
    isMature: character.isMature,
  };
}

export async function currentMemory(chatId: string): Promise<{ summary: string; coversThrough: number } | null> {
  const memory = await prisma.memory.findFirst({
    where: { chatId },
    orderBy: { createdAt: "desc" },
  });
  return memory ? { summary: memory.summary, coversThrough: memory.coversThrough } : null;
}

/**
 * Folds turns that have aged out of the live window into a rolling summary.
 *
 * Runs after a reply is saved rather than before generation so it never adds
 * latency to the user's turn. Failures are swallowed: a missing summary
 * degrades continuity but must not break the chat.
 */
export async function updateMemory(chatId: string, plan: Plan, settings: ChatSettings): Promise<void> {
  try {
    const limit = PLAN_LIMITS[plan].memoryTurns;
    const total = await prisma.message.count({ where: { chatId } });
    // Only summarise once there is meaningfully more history than fits.
    if (total < limit + 10) return;

    const existing = await currentMemory(chatId);
    const from = existing?.coversThrough ?? 0;
    const upTo = total - limit;
    if (upTo <= from) return;

    const messages = await loadMessages(chatId);
    const slice = messages.slice(from, upTo);
    if (slice.length === 0) return;

    const transcript = slice
      .map((m) => `${m.role === "user" ? m.authorName || "User" : m.authorName || "Character"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 24_000);

    const provider = getProviderForModel(settings.model);
    const summary = await provider.complete({
      system:
        "You are a story archivist. You compress roleplay transcripts into dense, factual notes. Output only the summary text.",
      messages: [{ role: "user", content: buildMemoryPrompt(existing?.summary ?? null, transcript) }],
      model: settings.model,
      temperature: 0.3,
      maxTokens: 500,
    });

    if (summary.trim()) {
      await prisma.memory.create({
        data: { chatId, summary: summary.trim(), coversThrough: upTo },
      });
    }
  } catch (error) {
    console.error("Memory update failed for chat", chatId, error);
  }
}

export interface PreparedGeneration {
  system: string;
  turns: ChatTurn[];
  settings: ChatSettings;
  speaker: { id: string; name: string };
  estimatedTokens: number;
}

/** Assembles everything the provider needs for one reply. */
export async function prepareGeneration(opts: {
  chat: NonNullable<LoadedChat>;
  messages: ResolvedMessage[];
  viewer: Viewer;
  requestedSpeakerId?: string;
}): Promise<PreparedGeneration> {
  const { chat, messages, viewer } = opts;
  const settings = resolveChatSettings(chat.settings, viewer);
  const characters = chat.participants.map((p) => p.character);

  if (characters.length === 0) {
    throw notFound("This chat has no characters left in it.");
  }

  const isGroup = chat.mode === "group" && characters.length > 1;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const speaker = isGroup
    ? pickSpeaker(characters, lastUserText, lastAssistant?.characterId ?? null, opts.requestedSpeakerId)
    : characters[0];

  const memory = await currentMemory(chat.id);
  const names = new Map(characters.map((c) => [c.id, c.name] as const));

  const system = buildSystemPrompt({
    characters: characters.map(toDefinition),
    speaking: toDefinition(speaker),
    persona: chat.persona ? { name: chat.persona.name, description: chat.persona.description } : null,
    memory: memory?.summary ?? null,
    matureAllowed: viewer.allowMature,
    responseLength: settings.responseLength,
  });

  const turns = isGroup
    ? labelGroupTurns(messages, names, viewer.plan)
    : windowTurns(messages, viewer.plan);

  return {
    system,
    turns,
    settings,
    speaker: { id: speaker.id, name: speaker.name },
    estimatedTokens:
      estimateTokens(system) + turns.reduce((n, t) => n + estimateTokens(t.content), 0),
  };
}

export { maxTokensFor, getModel };
export { labelGroupTurns, pickSpeaker, windowTurns } from "./turns";
