import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { json, notFound, route } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Toggles a like and keeps the denormalised counter in step. */
export const POST = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();

  const character = await prisma.character.findUnique({ where: { id }, select: { id: true } });
  if (!character) throw notFound("That character doesn't exist.");

  const key = { userId_characterId: { userId: viewer.id, characterId: id } };
  const existing = await prisma.favorite.findUnique({ where: key });

  const favorited = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.favorite.delete({ where: key });
      await tx.character.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
      return false;
    }
    await tx.favorite.create({ data: { userId: viewer.id, characterId: id } });
    await tx.character.update({ where: { id }, data: { likeCount: { increment: 1 } } });
    return true;
  });

  const likeCount = await prisma.favorite.count({ where: { characterId: id } });
  return json({ favorited, likeCount });
});
