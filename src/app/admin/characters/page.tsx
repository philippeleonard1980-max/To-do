import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui";
import { CharacterActionsAdmin } from "@/components/AdminActions";
import { AdminSearch } from "@/components/AdminSearch";

export const dynamic = "force-dynamic";

export default async function AdminCharacters({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Re-checked here, not just in the layout: layouts and pages render in
  // parallel, so a layout-only gate still lets this page query and stream.
  await requireAdmin();
  const params = await searchParams;
  const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]);
  const q = one("q")?.trim();
  const filter = one("filter");

  const where: Prisma.CharacterWhereInput = {
    ...(q ? { OR: [{ name: { contains: q } }, { tagline: { contains: q } }] } : {}),
    ...(filter === "mature" ? { isMature: true } : {}),
    ...(filter === "private" ? { visibility: "private" } : {}),
  };

  const characters = await prisma.character.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      creator: { select: { username: true } },
      _count: { select: { reports: true } },
    },
  });

  return (
    <div className="space-y-4">
      <AdminSearch basePath="/admin/characters" placeholder="Search characters by name…" />

      <div className="flex gap-1.5">
        {[
          { key: undefined, label: "All" },
          { key: "mature", label: "18+" },
          { key: "private", label: "Private" },
        ].map((option) => (
          <Link
            key={option.label}
            href={`/admin/characters${option.key ? `?filter=${option.key}` : ""}`}
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

      {characters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center text-sm text-faint">
          No characters matched.
        </p>
      ) : (
        <ul className="space-y-2">
          {characters.map((character) => (
            <li
              key={character.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3"
            >
              <Avatar
                name={character.name}
                src={character.avatarUrl}
                accent={character.accent}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/character/${character.id}`}
                    className="truncate text-sm font-medium hover:text-violet-400"
                  >
                    {character.name}
                  </Link>
                  {character.isMature && <Badge tone="warn">18+</Badge>}
                  {character.visibility !== "public" && <Badge>{character.visibility}</Badge>}
                  {character._count.reports > 0 && (
                    <Badge tone="warn">{character._count.reports} report(s)</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-faint">
                  @{character.creator.username} · {character.chatCount} chats ·{" "}
                  {character.likeCount} likes
                </p>
              </div>
              <CharacterActionsAdmin id={character.id} name={character.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
