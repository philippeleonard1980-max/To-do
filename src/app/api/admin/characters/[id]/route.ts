import { prisma } from "@/lib/db";
import { json, notFound, route } from "@/lib/api";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { adminCharacterActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = adminCharacterActionSchema.parse(await request.json());

  const target = await prisma.character.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!target) throw notFound("No such character.");

  if (body.action === "unpublish") {
    // Hides it everywhere without destroying the author's work.
    await prisma.character.update({ where: { id }, data: { visibility: "private" } });
    await logAdminAction({
      actorId: admin.id,
      action: "character.unpublish",
      targetType: "character",
      targetId: id,
      detail: target.name,
    });
  } else {
    await prisma.character.delete({ where: { id } });
    await logAdminAction({
      actorId: admin.id,
      action: "character.delete",
      targetType: "character",
      targetId: id,
      detail: target.name,
    });
  }

  return json({ ok: true });
});
