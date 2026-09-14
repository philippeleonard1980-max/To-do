import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  // Re-checked here, not just in the layout: layouts and pages render in
  // parallel, so a layout-only gate still lets this page query and stream.
  await requireAdmin();
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { username: true, displayName: true } } },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-dim">
        Append-only record of moderator actions. Written server-side after the actor&apos;s admin
        role is re-checked — it is never populated from a request body.
      </p>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center text-sm text-faint">
          No actions recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <Badge tone="accent">{entry.action}</Badge>
              <span className="min-w-0 flex-1 truncate text-dim">
                {entry.detail || `${entry.targetType}:${entry.targetId}`}
              </span>
              <span className="shrink-0 text-xs text-faint">@{entry.actor.username}</span>
              <time className="shrink-0 text-xs text-faint" dateTime={entry.createdAt.toISOString()}>
                {entry.createdAt.toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
