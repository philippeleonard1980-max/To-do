import Link from "next/link";
import { Sparkles, TrendingUp, Clock, Heart, MessageSquare, Plus } from "lucide-react";
import clsx from "clsx";

import { getViewer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { browseCharacters } from "@/lib/characters";
import { CharacterGrid } from "@/components/CharacterCard";
import { SearchBar } from "@/components/SearchBar";
import { Button, EmptyState } from "@/components/ui";
import { SORTS, type Sort } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SORT_META: Record<Sort, { label: string; icon: typeof TrendingUp }> = {
  trending: { label: "Trending", icon: TrendingUp },
  new: { label: "New", icon: Clock },
  popular: { label: "Most liked", icon: Heart },
  chats: { label: "Most chatted", icon: MessageSquare },
};

const PAGE_SIZE = 24;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();

  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = single("sort");
  const sort: Sort = SORTS.includes(sortParam as Sort) ? (sortParam as Sort) : "trending";
  const q = single("q");
  const tag = single("tag");
  const page = Math.max(0, Number.parseInt(single("page") ?? "0", 10) || 0);

  const [{ items, total }, tags] = await Promise.all([
    browseCharacters({
      q,
      tag,
      sort,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      viewerId: viewer?.id ?? null,
      includeMature: Boolean(viewer?.allowMature && viewer.settings.showMature),
    }),
    prisma.tag.findMany({
      include: { _count: { select: { characters: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const popularTags = tags
    .filter((t) => t._count.characters > 0)
    .sort((a, b) => b._count.characters - a._count.characters)
    .slice(0, 18);

  const buildHref = (next: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const merged = { q, tag, sort, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "sort" && value === "trending")) search.set(key, value);
    }
    const qs = search.toString();
    return qs ? `/?${qs}` : "/";
  };

  const hasFilter = Boolean(q || tag);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {!viewer && !hasFilter && page === 0 && <Hero />}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:max-w-md sm:flex-1">
          <SearchBar />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SORTS.map((option) => {
            const { label, icon: Icon } = SORT_META[option];
            const active = sort === option;
            return (
              <Link
                key={option}
                href={buildHref({ sort: option, page: undefined })}
                className={clsx(
                  "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition",
                  active
                    ? "bg-violet-600 text-white"
                    : "border border-[var(--border)] text-dim hover:border-violet-500/50 hover:text-[var(--text)]",
                )}
              >
                <Icon size={13} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {popularTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ tag: undefined, page: undefined })}
            className={clsx(
              "rounded-full px-3 py-1 text-xs transition",
              !tag
                ? "bg-white/[0.12] font-medium text-[var(--text)]"
                : "border border-[var(--border)] text-dim hover:text-[var(--text)]",
            )}
          >
            All
          </Link>
          {popularTags.map((t) => (
            <Link
              key={t.slug}
              href={buildHref({ tag: t.slug, page: undefined })}
              className={clsx(
                "rounded-full px-3 py-1 text-xs transition",
                tag === t.slug
                  ? "bg-violet-600 font-medium text-white"
                  : "border border-[var(--border)] text-dim hover:border-violet-500/50 hover:text-[var(--text)]",
              )}
            >
              {t.name}
              <span className="ml-1.5 text-[10px] opacity-50">{t._count.characters}</span>
            </Link>
          ))}
        </div>
      )}

      {hasFilter && (
        <p className="mb-4 text-sm text-dim">
          {total} {total === 1 ? "character" : "characters"}
          {q && (
            <>
              {" "}
              matching <span className="text-[var(--text)]">“{q}”</span>
            </>
          )}
          {tag && (
            <>
              {" "}
              tagged <span className="text-[var(--text)]">{tag}</span>
            </>
          )}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={32} />}
          title={hasFilter ? "Nothing matched that" : "No characters yet"}
          description={
            hasFilter
              ? "Try a different search, or clear the filters to see everything."
              : "Be the first — build a character, give them a voice, and start a conversation."
          }
          action={
            hasFilter ? (
              <Link href="/">
                <Button variant="outline">Clear filters</Button>
              </Link>
            ) : (
              <Link href="/create">
                <Button>
                  <Plus size={16} /> Create a character
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <CharacterGrid characters={items} />
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 0 && (
            <Link href={buildHref({ page: String(page - 1) })}>
              <Button variant="outline" size="sm">
                Previous
              </Button>
            </Link>
          )}
          <span className="px-3 text-xs text-faint tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          {page + 1 < totalPages && (
            <Link href={buildHref({ page: String(page + 1) })}>
              <Button variant="outline" size="sm">
                Next
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Hero() {
  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-violet-600/15 via-[var(--surface-raised)] to-rose-500/10 px-6 py-12 text-center sm:px-12 sm:py-16">
      <h1 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
        Characters worth talking to.
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-dim sm:text-base">
        Write a character, give them a past and a voice, and hold a real conversation.
        Bring your own persona, put several characters in one room, and pick up where you
        left off — they remember.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/register">
          <Button size="lg">Start talking — it&apos;s free</Button>
        </Link>
        <Link href="/create">
          <Button size="lg" variant="outline">
            <Plus size={16} /> Build a character
          </Button>
        </Link>
      </div>
    </section>
  );
}
