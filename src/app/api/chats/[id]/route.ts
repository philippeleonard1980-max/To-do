import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { badRequest, json, route } from "@/lib/api";
import { chatUpdateSchema } from "@/lib/validation";
import { parseJson, stringifyJson } from "@/lib/json";
import { planAllowsModel } from "@/lib/constants";
import { loadChat, loadMessages, resolveChatSettings, currentMemory } from "@/lib/chat-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const chat = await loadChat(id, viewer);
  const [messages, memory] = await Promise.all([loadMessages(id), currentMemory(id)]);

  return json({
    chat: {
      id: chat.id,
      title: chat.title,
      mode: chat.mode,
      pinned: chat.pinned,
      archived: chat.archived,
      personaId: chat.personaId,
      persona: chat.persona ? { id: chat.persona.id, name: chat.persona.name } : null,
      settings: resolveChatSettings(chat.settings, viewer),
      characters: chat.participants.map((p) => ({
        id: p.character.id,
        name: p.character.name,
        avatarUrl: p.character.avatarUrl,
        accent: p.character.accent,
        tagline: p.character.tagline,
      })),
    },
    messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    memory: memory?.summary ?? null,
  });
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const chat = await loadChat(id, viewer);
  const body = chatUpdateSchema.parse(await request.json());

  if (body.settings?.model && !planAllowsModel(viewer.plan, body.settings.model)) {
    throw badRequest("That model isn't included in your plan.");
  }

  if (body.personaId) {
    const persona = await prisma.persona.findFirst({
      where: { id: body.personaId, userId: viewer.id },
      select: { id: true },
    });
    if (!persona) throw badRequest("That persona doesn't exist.");
  }

  const settings = body.settings
    ? stringifyJson({ ...parseJson(chat.settings, {}), ...body.settings })
    : undefined;

  const updated = await prisma.chat.update({
    where: { id },
    data: {
      title: body.title,
      personaId: body.personaId === undefined ? undefined : body.personaId,
      pinned: body.pinned,
      archived: body.archived,
      ...(settings ? { settings } : {}),
    },
  });

  return json({ ok: true, settings: resolveChatSettings(updated.settings, viewer) });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  await loadChat(id, viewer);
  await prisma.chat.delete({ where: { id } });
  return json({ ok: true });
});
