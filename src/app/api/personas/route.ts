import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { badRequest, json, route } from "@/lib/api";
import { personaSchema } from "@/lib/validation";
import { PLAN_LIMITS } from "@/lib/constants";

export const runtime = "nodejs";

export const GET = route(async () => {
  const viewer = await requireViewer();
  const personas = await prisma.persona.findMany({
    where: { userId: viewer.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return json({ items: personas });
});

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const body = personaSchema.parse(await request.json());

  const count = await prisma.persona.count({ where: { userId: viewer.id } });
  const limit = PLAN_LIMITS[viewer.plan].personas;
  if (count >= limit) {
    throw badRequest(`Your plan includes ${limit} personas. Upgrade or delete one to add another.`);
  }

  const persona = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.persona.updateMany({ where: { userId: viewer.id }, data: { isDefault: false } });
    }
    return tx.persona.create({
      data: {
        userId: viewer.id,
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl || null,
        // The very first persona is the default whatever the client sent.
        isDefault: body.isDefault || count === 0,
      },
    });
  });

  return json({ persona }, { status: 201 });
});
