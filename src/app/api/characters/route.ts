import { prisma } from "@/lib/db";
import { getViewer, requireViewer } from "@/lib/auth";
import { badRequest, json, route } from "@/lib/api";
import { browseSchema, characterSchema } from "@/lib/validation";
import { browseCharacters, resolveTags, toCardView, characterCard } from "@/lib/characters";
import { looksMature, screenCharacter } from "@/lib/safety";

export const runtime = "nodejs";

export const GET = route(async (request: Request) => {
  const viewer = await getViewer();
  const url = new URL(request.url);
  const params = browseSchema.parse(Object.fromEntries(url.searchParams));
  const offset = Number.parseInt(params.cursor ?? "0", 10) || 0;

  const result = await browseCharacters({
    q: params.q,
    tag: params.tag,
    sort: params.sort,
    creator: params.creator,
    limit: params.limit,
    offset,
    viewerId: viewer?.id ?? null,
    includeMature: Boolean(viewer?.allowMature && viewer.settings.showMature),
  });

  const nextOffset = offset + params.limit;
  return json({
    items: result.items,
    total: result.total,
    nextCursor: nextOffset < result.total ? String(nextOffset) : null,
  });
});

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const body = characterSchema.parse(await request.json());

  const verdict = screenCharacter(body);
  if (!verdict.ok) throw badRequest(verdict.reason ?? "That character can't be published.");

  // Auto-flag adult themes even when the author left the toggle off, so browse
  // filtering stays honest.
  const isMature =
    body.isMature ||
    looksMature([body.description, body.personality, body.scenario, body.greeting, body.tags.join(" ")].join(" "));

  if (isMature && !viewer.isAdult) {
    throw badRequest("Add your birthdate in settings before publishing a character with mature themes.");
  }

  const tagIds = await resolveTags(body.tags);

  const character = await prisma.character.create({
    data: {
      creatorId: viewer.id,
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
      visibility: body.visibility,
      isMature,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    select: characterCard,
  });

  return json({ character: toCardView(character) }, { status: 201 });
});
