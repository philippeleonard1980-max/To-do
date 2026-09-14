import "server-only";

import { prisma } from "./db";
import { getViewer, type Viewer } from "./auth";
import { HttpError, notFound } from "./api";

/**
 * Admin access control.
 *
 * Design notes, because this panel ships in a public repository:
 *
 *  - The session JWT carries only a user id. Roles are never encoded in the
 *    token, so revoking admin takes effect on the very next request rather
 *    than when a token expires.
 *  - Every entry point re-reads the role from the database. There is no
 *    cached or client-supplied role anywhere in this file.
 *  - Non-admins get 404, not 403. A 403 confirms the panel exists; a 404
 *    tells an unauthenticated prober nothing.
 *  - There is deliberately no HTTP route that grants admin. The only way to
 *    create the first admin is `npm run admin:grant <email>`, which needs
 *    shell access to the server. Nothing reachable from the internet can
 *    escalate a normal account.
 */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw notFound();

  // Re-read rather than trusting the resolved viewer object.
  const fresh = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { role: true, suspended: true },
  });

  if (!fresh || fresh.suspended || fresh.role !== "admin") throw notFound();
  return viewer;
}

/** True when the current viewer is an admin. Never throws — for nav rendering. */
export async function isAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

export type AuditAction =
  | "user.suspend"
  | "user.unsuspend"
  | "user.role"
  | "user.plan"
  | "character.unpublish"
  | "character.delete"
  | "report.resolve"
  | "report.dismiss";

/**
 * Appends to the audit trail. Called only after `requireAdmin` has passed.
 * `detail` is written by this server, never echoed from a request body.
 */
export async function logAdminAction(opts: {
  actorId: string;
  action: AuditAction;
  targetType: "user" | "character" | "report";
  targetId: string;
  detail?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      detail: (opts.detail ?? "").slice(0, 500),
    },
  });
}

/**
 * Blocks changes that would lock every administrator out of the instance, and
 * self-inflicted moderation. Throws with a message safe to show an admin.
 */
export async function guardSelfAndLastAdmin(opts: {
  actorId: string;
  targetId: string;
  /** The action removes the target's admin access (demote or suspend). */
  removesAdminAccess: boolean;
}): Promise<void> {
  if (opts.actorId === opts.targetId) {
    throw new HttpError(400, "You can't apply moderation actions to your own account.");
  }
  if (!opts.removesAdminAccess) return;

  const target = await prisma.user.findUnique({
    where: { id: opts.targetId },
    select: { role: true },
  });
  if (target?.role !== "admin") return;

  const admins = await prisma.user.count({ where: { role: "admin", suspended: false } });
  if (admins <= 1) {
    throw new HttpError(400, "That's the last active administrator. Promote someone else first.");
  }
}

/** Counts for the dashboard. */
export async function adminStats() {
  const [users, suspended, characters, mature, chats, messages, openReports, admins] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { suspended: true } }),
      prisma.character.count(),
      prisma.character.count({ where: { isMature: true } }),
      prisma.chat.count(),
      prisma.message.count(),
      prisma.report.count({ where: { status: "open" } }),
      prisma.user.count({ where: { role: "admin" } }),
    ]);

  return { users, suspended, characters, mature, chats, messages, openReports, admins };
}
