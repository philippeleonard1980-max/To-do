import { prisma } from "@/lib/db";
import { json, notFound, route } from "@/lib/api";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { adminReportActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const { status } = adminReportActionSchema.parse(await request.json());

  const report = await prisma.report.findUnique({ where: { id }, select: { id: true } });
  if (!report) throw notFound("No such report.");

  await prisma.report.update({ where: { id }, data: { status } });
  await logAdminAction({
    actorId: admin.id,
    action: status === "reviewed" ? "report.resolve" : "report.dismiss",
    targetType: "report",
    targetId: id,
  });

  return json({ ok: true });
});
