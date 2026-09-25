import { prisma } from "@/lib/db";
import { stringifyJson } from "@/lib/json";
import { getViewer, requireViewer } from "@/lib/auth";
import { badRequest, forbidden, json, notFound, route } from "@/lib/api";
import { characterSchema } from "@/lib/validation";
import { resolveTags } from "@/lib/characters";
import { looksMature, screenCharacter } from "@/lib/safety";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await getViewer();

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
    },
  });

  if (!character) throw notFound("That character doesn't exist.");
  if (character.visibility === "private" && character.creatorId !== viewer?.id) {
    throw notFound("That character doesn't exist.");
  }

  const [favorited, favoriteCount] = await Promise.all([
    viewer
      ? prisma.favorite.findUnique({
          where: { userId_characterId: { userId: viewer.id, characterId: id } },
        })
      : null,
    prisma.favorite.count({ where: { characterId: id } }),
  ]);

  // Fire-and-forget view counter; a failure here must not break the page.
  prisma.character
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  return json({
    character: {
      ...character,
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
      tags: character.tags.map((t) => t.tag),
      // Only the author sees the raw prompt internals.
      systemPromptOverride: character.creatorId === viewer?.id ? character.systemPromptOverride : null,
      exampleDialogue: character.creatorId === viewer?.id ? character.exampleDialogue : "",
    },
    favorited: Boolean(favorited),
    favoriteCount,
    isOwner: character.creatorId === viewer?.id,
  });
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();

  const existing = await prisma.character.findUnique({ where: { id }, select: { creatorId: true } });
  if (!existing) throw notFound("That character doesn't exist.");
  if (existing.creatorId !== viewer.id) throw forbidden("You can only edit characters you created.");

  const body = characterSchema.parse(await request.json());
  const verdict = screenCharacter(body);
  if (!verdict.ok) throw badRequest(verdict.reason ?? "That character can't be saved.");

  const isMature =
    body.isMature ||
    looksMature([body.description, body.personality, body.scenario, body.greeting, body.tags.join(" ")].join(" "));

  if (isMature && !viewer.isAdult) {
    throw badRequest("Add your birthdate in settings before saving a character with mature themes.");
  }

  const tagIds = await resolveTags(body.tags);

  const character = await prisma.$transaction(async (tx) => {
    await tx.characterTag.deleteMany({ where: { characterId: id } });
    return tx.character.update({
      where: { id },
      data: {
        name: body.name,
        tagline: body.tagline,
        description: body.description,
        personality: body.personality,
        scenario: body.scenario,
        greeting: body.greeting,
        exampleDialogue: body.exampleDialogue,
        systemPromptOverride: body.systemPromptOverride || null,
        avatarUrl: body.avatarUrl || null,
        accent: body.accent,
      voice: stringifyJson(body.voice),
        visibility: body.visibility,
        isMature,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
  });

  return json({ ok: true, id: character.id });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();

  const existing = await prisma.character.findUnique({ where: { id }, select: { creatorId: true } });
  if (!existing) throw notFound("That character doesn't exist.");
  if (existing.creatorId !== viewer.id && viewer.role !== "admin") {
    throw forbidden("You can only delete characters you created.");
  }

  await prisma.character.delete({ where: { id } });
  return json({ ok: true });
});
