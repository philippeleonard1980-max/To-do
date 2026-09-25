import { prisma } from "@/lib/db";
import { requireViewer, type Viewer } from "@/lib/auth";
import { badRequest, errorResponse, notFound } from "@/lib/api";
import { sendMessageSchema } from "@/lib/validation";
import { sseResponse } from "@/lib/sse";
import { getProviderForModel, type VendorKeys } from "@/lib/ai";
import { resolveUserKeys } from "@/lib/user-keys";
import { refundCredits, spendCredits } from "@/lib/credits";
import { needsCrisisResources } from "@/lib/safety";
import { maxTokensFor } from "@/lib/prompt";
import {
  loadChat,
  loadMessages,
  prepareGeneration,
  updateMemory,
  type ResolvedMessage,
} from "@/lib/chat-service";

export const runtime = "nodejs";
// Streaming replies routinely outlive the default serverless budget.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/**
 * Sends a turn and streams the reply back as server-sent events.
 *
 * Event sequence:
 *   user      — the persisted user turn (so the client can swap its optimistic row)
 *   start     — the assistant turn shell, with id + speaking character
 *   delta     — incremental text
 *   done      — final content, token usage, remaining credits
 *   error     — generation failed; credits already refunded
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await requireViewer();
    const body = sendMessageSchema.parse(await request.json());

    const chat = await loadChat(id, viewer);
    if (chat.participants.length === 0) throw notFound("This chat has no characters left in it.");

    if (!body.regenerate && !body.content.trim()) {
      throw badRequest("Write something first.");
    }

    return await generate({ chat, viewer, body });
  } catch (error) {
    return errorResponse(error);
  }
}

type Chat = Awaited<ReturnType<typeof loadChat>>;

async function generate(opts: {
  chat: Chat;
  viewer: Viewer;
  body: { content: string; speakerId?: string; regenerate: boolean };
}) {
  const { chat, viewer, body } = opts;
  const userName = chat.persona?.name ?? viewer.displayName;

  // --- Persist the user's turn (or locate the turn being regenerated) ------
  let messages: ResolvedMessage[] = await loadMessages(chat.id);
  let userMessagePayload: Record<string, unknown> | null = null;
  let regenTarget: { id: string; nextIndex: number } | null = null;

  if (body.regenerate) {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) throw badRequest("There's no reply to regenerate yet.");
    regenTarget = { id: last.id, nextIndex: last.variantCount };
    // Context must stop before the turn we're re-rolling.
    messages = messages.filter((m) => m.position < last.position);
  } else {
    const position = messages.length > 0 ? messages[messages.length - 1].position + 1 : 0;
    const created = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: "user",
        authorName: userName,
        position,
        variants: { create: { index: 0, content: body.content.trim() } },
      },
    });
    userMessagePayload = {
      id: created.id,
      role: "user",
      content: body.content.trim(),
      authorName: userName,
      position,
      activeVariant: 0,
      variantCount: 1,
      createdAt: created.createdAt.toISOString(),
    };
    messages = await loadMessages(chat.id);
  }

  // The viewer's own key, when they have set one, takes precedence over the
  // instance's env key for every call this turn makes.
  const userKeys = await resolveUserKeys(viewer.id);

  const prepared = await prepareGeneration({
    chat,
    messages,
    viewer,
    requestedSpeakerId: body.speakerId,
  });

  // --- Reserve credits before doing any expensive work --------------------
  const cost = await spendCredits(viewer.id, prepared.settings.model);

  // --- Create the assistant shell so the client has a stable id -----------
  let assistantMessageId: string;
  let variantIndex: number;

  if (regenTarget) {
    assistantMessageId = regenTarget.id;
    variantIndex = regenTarget.nextIndex;
    await prisma.messageVariant.create({
      data: {
        messageId: assistantMessageId,
        index: variantIndex,
        content: "",
        model: prepared.settings.model,
      },
    });
    await prisma.message.update({
      where: { id: assistantMessageId },
      data: { activeVariant: variantIndex, characterId: prepared.speaker.id, authorName: prepared.speaker.name },
    });
  } else {
    const position = messages.length > 0 ? messages[messages.length - 1].position + 1 : 0;
    const shell = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: "assistant",
        characterId: prepared.speaker.id,
        authorName: prepared.speaker.name,
        position,
        activeVariant: 0,
        variants: { create: { index: 0, content: "", model: prepared.settings.model } },
      },
    });
    assistantMessageId = shell.id;
    variantIndex = 0;
  }

  const crisis = needsCrisisResources(body.content);

  return sseResponse(async (emit, signal) => {
    if (userMessagePayload) emit({ type: "user", message: userMessagePayload });
    if (crisis) emit({ type: "crisis" });

    emit({
      type: "start",
      message: {
        id: assistantMessageId,
        role: "assistant",
        characterId: prepared.speaker.id,
        authorName: prepared.speaker.name,
        variantIndex,
        model: prepared.settings.model,
      },
    });

    const provider = getProviderForModel(prepared.settings.model, userKeys);
    let text = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let finishReason: string | undefined;
    let failed: string | null = null;

    try {
      const stream = provider.stream({
        system: prepared.system,
        messages: prepared.turns,
        model: prepared.settings.model,
        temperature: prepared.settings.temperature,
        maxTokens: maxTokensFor(prepared.settings.responseLength),
        signal,
      });

      for await (const chunk of stream) {
        if (chunk.type === "text" && chunk.text) {
          text += chunk.text;
          emit({ type: "delta", text: chunk.text });
        } else if (chunk.type === "done") {
          tokensIn = chunk.tokensIn ?? 0;
          tokensOut = chunk.tokensOut ?? 0;
          finishReason = chunk.finishReason;
        } else if (chunk.type === "error") {
          failed = chunk.message ?? "Generation failed.";
          break;
        }
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : "Generation failed.";
    }

    // A stopped stream keeps whatever was written; a hard failure rolls back.
    if (failed && !text) {
      await refundCredits(viewer.id, cost, "generation-failed");
      await discardVariant(assistantMessageId, variantIndex);
      emit({ type: "error", error: failed });
      return;
    }

    const finalText = text.trim() || "*(no reply — try regenerating)*";

    await prisma.messageVariant.updateMany({
      where: { messageId: assistantMessageId, index: variantIndex },
      data: { content: finalText, tokensIn, tokensOut, finishReason: finishReason ?? null },
    });

    await prisma.chat.update({
      where: { id: chat.id },
      data: { lastMessageAt: new Date() },
    });

    const remaining = await prisma.user.findUnique({
      where: { id: viewer.id },
      select: { credits: true },
    });

    emit({
      type: "done",
      message: {
        id: assistantMessageId,
        content: finalText,
        variantIndex,
        model: prepared.settings.model,
        finishReason: finishReason ?? null,
      },
      usage: { tokensIn, tokensOut, cost },
      credits: remaining?.credits ?? 0,
      ...(failed ? { warning: failed } : {}),
    });

    // Housekeeping that must not delay the reply.
    await Promise.allSettled([
      updateMemory(chat.id, viewer.plan, prepared.settings, userKeys),
      maybeTitle(chat.id, chat.title, body.content, userKeys),
    ]);
  });
}

/** Removes an empty variant left behind by a failed generation. */
async function discardVariant(messageId: string, index: number) {
  await prisma.messageVariant.deleteMany({ where: { messageId, index } });
  const remaining = await prisma.messageVariant.findMany({
    where: { messageId },
    orderBy: { index: "asc" },
  });
  if (remaining.length === 0) {
    await prisma.message.delete({ where: { id: messageId } }).catch(() => {});
  } else {
    await prisma.message.update({
      where: { id: messageId },
      data: { activeVariant: remaining[remaining.length - 1].index },
    });
  }
}

/**
 * Names a chat from its first real user turn. Uses the cheap path and never
 * throws — an unnamed chat is a cosmetic problem, not a failure.
 */
async function maybeTitle(
  chatId: string,
  currentTitle: string,
  firstUserText: string,
  keys?: VendorKeys,
) {
  try {
    if (!firstUserText.trim()) return;
    const count = await prisma.message.count({ where: { chatId, role: "user" } });
    if (count !== 1) return;

    // Titles always use the cheap model, whichever vendor serves it.
    const titleModel = "claude-haiku-4-5-20251001";
    const provider = getProviderForModel(titleModel, keys);
    const title = await provider.complete({
      system:
        "You write very short chat titles. Reply with a title of at most 5 words. No quotes, no punctuation at the end.",
      messages: [{ role: "user", content: firstUserText.slice(0, 500) }],
      model: titleModel,
      temperature: 0.4,
      maxTokens: 24,
    });

    const clean = title.replace(/^["'\s]+|["'\s.]+$/g, "").slice(0, 60);
    if (clean && clean.toLowerCase() !== currentTitle.toLowerCase()) {
      await prisma.chat.update({ where: { id: chatId }, data: { title: clean } });
    }
  } catch {
    // Keep the character-name default.
  }
}
