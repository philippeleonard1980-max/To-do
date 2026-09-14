import { prisma } from "@/lib/db";
import { json, notFound, route } from "@/lib/api";
import { requireAdmin, logAdminAction, guardSelfAndLastAdmin } from "@/lib/admin";
import { adminUserActionSchema } from "@/lib/validation";
import { planInfo } from "@/lib/constants";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  // Throws 404 for anyone who is not a current, unsuspended admin.
  const admin = await requireAdmin();
  const { id } = await params;
  const body = adminUserActionSchema.parse(await request.json());

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, username: true, role: true, suspended: true },
  });
  if (!target) throw notFound("No such account.");

  const removesAdminAccess =
    body.action === "suspend" || (body.action === "setRole" && body.role === "user");
  await guardSelfAndLastAdmin({ actorId: admin.id, targetId: id, removesAdminAccess });

  switch (body.action) {
    case "suspend":
      await prisma.user.update({
        where: { id },
        data: { suspended: true, suspendedReason: body.reason },
      });
      await logAdminAction({
        actorId: admin.id,
        action: "user.suspend",
        targetType: "user",
        targetId: id,
        detail: `@${target.username}${body.reason ? `: ${body.reason}` : ""}`,
      });
      break;

    case "unsuspend":
      await prisma.user.update({
        where: { id },
        data: { suspended: false, suspendedReason: null },
      });
      await logAdminAction({
        actorId: admin.id,
        action: "user.unsuspend",
        targetType: "user",
        targetId: id,
        detail: `@${target.username}`,
      });
      break;

    case "setRole":
      await prisma.user.update({ where: { id }, data: { role: body.role } });
      await logAdminAction({
        actorId: admin.id,
        action: "user.role",
        targetType: "user",
        targetId: id,
        detail: `@${target.username} ${target.role} -> ${body.role}`,
      });
      break;

    case "setPlan": {
      const info = planInfo(body.plan);
      await prisma.user.update({
        where: { id },
        data: { plan: body.plan, credits: info.credits, creditsResetAt: new Date() },
      });
      await prisma.creditEntry.create({
        data: { userId: id, delta: info.credits, reason: `admin-plan:${body.plan}` },
      });
      await logAdminAction({
        actorId: admin.id,
        action: "user.plan",
        targetType: "user",
        targetId: id,
        detail: `@${target.username} -> ${body.plan}`,
      });
      break;
    }
  }

  return json({ ok: true });
});
