import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { json, route } from "@/lib/api";
import { reportSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** User-facing moderation queue entry point. */
export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const body = reportSchema.parse(await request.json());

  await prisma.report.create({
    data: {
      reporterId: viewer.id,
      characterId: body.characterId ?? null,
      reason: body.reason,
      detail: body.detail,
    },
  });

  return json({ ok: true }, { status: 201 });
});
