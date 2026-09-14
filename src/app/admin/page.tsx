import Link from "next/link";
import { AlertTriangle, MessageSquare, ShieldAlert, Users, Sparkles, Ban } from "lucide-react";

import { adminStats, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  // Re-checked here, not just in the layout: layouts and pages render in
  // parallel, so a layout-only gate still lets this page query and stream.
  await requireAdmin();
  const stats = await adminStats();

  const recent = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { actor: { select: { username: true } } },
  });

  const cards = [
    { label: "Accounts", value: stats.users, icon: Users, href: "/admin/users" },
    { label: "Suspended", value: stats.suspended, icon: Ban, href: "/admin/users?filter=suspended" },
    { label: "Characters", value: stats.characters, icon: Sparkles, href: "/admin/characters" },
    { label: "18+ characters", value: stats.mature, icon: AlertTriangle, href: "/admin/characters?filter=mature" },
    { label: "Chats", value: stats.chats, icon: MessageSquare, href: "/admin/characters" },
    { label: "Open reports", value: stats.openReports, icon: ShieldAlert, href: "/admin/reports" },
  ];

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 transition hover:border-violet-500/50"
          >
            <div className="flex items-center gap-2 text-xs text-faint">
              <Icon size={14} /> {label}
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent moderator actions</h2>
          <Link href="/admin/audit" className="text-xs text-violet-400 hover:text-violet-300">
            Full audit log →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-10 text-center text-sm text-faint">
            No moderator actions recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge tone="accent">{entry.action}</Badge>
                <span className="min-w-0 flex-1 truncate text-dim">{entry.detail || entry.targetId}</span>
                <span className="shrink-0 text-xs text-faint">@{entry.actor.username}</span>
                <time className="shrink-0 text-xs text-faint">
                  {entry.createdAt.toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--tone-warn-border)] bg-[var(--tone-warn-bg)] p-4">
        <h2 className="text-sm font-semibold text-[var(--tone-warn-strong)]">
          Granting admin access
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--tone-warn-text)]">
          There is no web route that can grant the admin role — by design, since this codebase is
          public. The first administrator is created from a shell on the server with{" "}
          <code className="rounded bg-black/20 px-1">npm run admin:grant -- you@example.com</code>.
          After that, admins can promote others from the Users tab.
        </p>
      </section>
    </div>
  );
}
