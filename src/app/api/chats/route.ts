import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { badRequest, json, notFound, route } from "@/lib/api";
import { chatCreateSchema } from "@/lib/validation";
import { PLAN_LIMITS } from "@/lib/constants";
import { applyMacros } from "@/lib/prompt";

export const runtime = "nodejs";

export const GET = route(async (request: Request) => {
  const viewer = await requireViewer();
  const url = new URL(request.url);
  const archived = url.searchParams.get("archived") === "true";

  const chats = await prisma.chat.findMany({
    where: { userId: viewer.id, archived },
    orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
    take: 100,
    include: {
      participants: {
        include: { character: { select: { id: true, name: true, avatarUrl: true, accent: true } } },
        orderBy: { order: "asc" },
      },
    },
  });

  const items = await Promise.all(
    chats.map(async (chat) => {
      const last = await prisma.message.findFirst({
        where: { chatId: chat.id },
        orderBy: { position: "desc" },
        include: { variants: true },
      });
      const active = last?.variants.find((v) => v.index === last.activeVariant) ?? last?.variants[0];
      return {
        id: chat.id,
        title: chat.title,
        mode: chat.mode,
        pinned: chat.pinned,
        lastMessageAt: chat.lastMessageAt.toISOString(),
        characters: chat.participants.map((p) => p.character),
        preview: active?.content.replace(/[*_#]/g, "").slice(0, 110) ?? "",
      };
    }),
  );

  return json({ items });
});

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const body = chatCreateSchema.parse(await request.json());

  const ids = [...new Set(body.characterIds)];
  const mode = ids.length > 1 ? "group" : "single";

  const maxGroup = PLAN_LIMITS[viewer.plan].groupSize;
  if (ids.length > maxGroup) {
    throw badRequest(`Your plan allows ${maxGroup} characters in a group chat.`);
  }

  const characters = await prisma.character.findMany({
    where: {
      id: { in: ids },
      OR: [{ visibility: { in: ["public", "unlisted"] } }, { creatorId: viewer.id }],
    },
  });
  if (characters.length !== ids.length) throw notFound("One of those characters isn't available.");

  const mature = characters.filter((c) => c.isMature);
  if (mature.length > 0 && !viewer.isAdult) {
    throw badRequest("Confirm your date of birth in settings to chat with mature characters.");
  }

  const persona = body.personaId
    ? await prisma.persona.findFirst({ where: { id: body.personaId, userId: viewer.id } })
    : await prisma.persona.findFirst({ where: { userId: viewer.id, isDefault: true } });

  // Keep the author's order rather than the database's.
  const ordered = ids.map((id) => characters.find((c) => c.id === id)!).filter(Boolean);
  const userName = persona?.name ?? viewer.displayName;

  const chat = await prisma.$transaction(async (tx) => {
    const created = await tx.chat.create({
      data: {
        userId: viewer.id,
        personaId: persona?.id ?? null,
        mode,
        title:
          body.title ??
          (ordered.length > 1
            ? ordered.map((c) => c.name).join(" & ")
            : ordered[0].name),
        participants: { create: ordered.map((c, index) => ({ characterId: c.id, order: index })) },
      },
    });

    // Seed the transcript with each character's greeting so the scene opens
    // the way its author intended.
    let position = 0;
    for (const character of ordered) {
      const greeting = character.greeting.trim();
      if (!greeting) continue;
      await tx.message.create({
        data: {
          chatId: created.id,
          role: "assistant",
          characterId: character.id,
          authorName: character.name,
          position: position++,
          variants: {
            create: { index: 0, content: applyMacros(greeting, character.name, userName) },
          },
        },
      });
    }

    await tx.character.updateMany({
      where: { id: { in: ids } },
      data: { chatCount: { increment: 1 } },
    });

    return created;
  });

  return json({ id: chat.id }, { status: 201 });
});
