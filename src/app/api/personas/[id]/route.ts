import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { forbidden, json, notFound, route } from "@/lib/api";
import { personaSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function ownedPersona(id: string, userId: string) {
  const persona = await prisma.persona.findUnique({ where: { id } });
  if (!persona) throw notFound("That persona doesn't exist.");
  if (persona.userId !== userId) throw forbidden("That persona belongs to someone else.");
  return persona;
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  await ownedPersona(id, viewer.id);
  const body = personaSchema.parse(await request.json());

  const persona = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.persona.updateMany({ where: { userId: viewer.id }, data: { isDefault: false } });
    }
    return tx.persona.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl || null,
        isDefault: body.isDefault,
      },
    });
  });

  return json({ persona });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const persona = await ownedPersona(id, viewer.id);

  await prisma.persona.delete({ where: { id } });

  // Promote another persona so the account always has a default to fall back on.
  if (persona.isDefault) {
    const next = await prisma.persona.findFirst({
      where: { userId: viewer.id },
      orderBy: { createdAt: "asc" },
    });
    if (next) await prisma.persona.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  return json({ ok: true });
});
