import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui";
import { UserActions } from "@/components/AdminActions";
import { AdminSearch } from "@/components/AdminSearch";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]);
  const q = one("q")?.trim();
  const filter = one("filter");

  const where: Prisma.UserWhereInput = {
    ...(q
      ? { OR: [{ username: { contains: q } }, { displayName: { contains: q } }, { email: { contains: q } }] }
      : {}),
    ...(filter === "suspended" ? { suspended: true } : {}),
    ...(filter === "admins" ? { role: "admin" } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      // Explicit select: passwordHash must never reach a page payload.
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      plan: true,
      credits: true,
      suspended: true,
      suspendedReason: true,
      createdAt: true,
      _count: { select: { characters: true, chats: true } },
    },
  });

  return (
    <div className="space-y-4">
      <AdminSearch basePath="/admin/users" placeholder="Search by name, handle or email…" />

      <div className="flex gap-1.5">
        {[
          { key: undefined, label: "All" },
          { key: "admins", label: "Admins" },
          { key: "suspended", label: "Suspended" },
        ].map((option) => (
          <Link
            key={option.label}
            href={`/admin/users${option.key ? `?filter=${option.key}` : ""}`}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              filter === option.key
                ? "bg-violet-600 text-white"
                : "border border-[var(--border)] text-dim hover:text-[var(--text)]"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center text-sm text-faint">
          No accounts matched.
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3"
            >
              <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/u/${user.username}`}
                    className="truncate text-sm font-medium hover:text-violet-400"
                  >
                    {user.displayName}
                  </Link>
                  <span className="text-xs text-faint">@{user.username}</span>
                  {user.role === "admin" && <Badge tone="accent">admin</Badge>}
                  {user.suspended && <Badge tone="warn">suspended</Badge>}
                </div>
                <p className="truncate text-xs text-faint">
                  {user.email} · {user.plan} · {user.credits} credits ·{" "}
                  {user._count.characters} characters · {user._count.chats} chats
                </p>
                {user.suspended && user.suspendedReason && (
                  <p className="mt-1 text-xs text-[var(--tone-warn-text)]">
                    Reason: {user.suspendedReason}
                  </p>
                )}
              </div>
              <UserActions
                id={user.id}
                username={user.username}
                suspended={user.suspended}
                role={user.role}
                isSelf={user.id === admin.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
