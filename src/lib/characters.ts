import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import { slugify } from "./slug";
import type { Sort } from "./constants";
import { trendingScore } from "./turns";

export { trendingScore };

export const characterCard = {
  id: true,
  name: true,
  tagline: true,
  avatarUrl: true,
  accent: true,
  isMature: true,
  visibility: true,
  chatCount: true,
  likeCount: true,
  createdAt: true,
  creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  tags: { select: { tag: { select: { name: true, slug: true } } } },
} satisfies Prisma.CharacterSelect;

export type CharacterCard = Prisma.CharacterGetPayload<{ select: typeof characterCard }>;

export interface CardView {
  id: string;
  name: string;
  tagline: string;
  avatarUrl: string | null;
  accent: string;
  isMature: boolean;
  visibility: string;
  chatCount: number;
  likeCount: number;
  createdAt: string;
  creator: { id: string; username: string; displayName: string; avatarUrl: string | null };
  tags: { name: string; slug: string }[];
}

export function toCardView(c: CharacterCard): CardView {
  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    avatarUrl: c.avatarUrl,
    accent: c.accent,
    isMature: c.isMature,
    visibility: c.visibility,
    chatCount: c.chatCount,
    likeCount: c.likeCount,
    createdAt: c.createdAt.toISOString(),
    creator: c.creator,
    tags: c.tags.map((t) => t.tag),
  };
}

export interface BrowseParams {
  q?: string;
  tag?: string;
  sort: Sort;
  creator?: string;
  limit: number;
  offset: number;
  /** Viewer id, so private/unlisted characters they own still appear. */
  viewerId?: string | null;
  includeMature: boolean;
}

export async function browseCharacters(params: BrowseParams): Promise<{ items: CardView[]; total: number }> {
  const and: Prisma.CharacterWhereInput[] = [];

  // Public characters, plus anything the viewer created themselves.
  and.push(
    params.viewerId
      ? { OR: [{ visibility: "public" }, { creatorId: params.viewerId }] }
      : { visibility: "public" },
  );

  if (!params.includeMature) and.push({ isMature: false });

  if (params.q) {
    const q = params.q;
    and.push({
      OR: [
        { name: { contains: q } },
        { tagline: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }

  if (params.tag) {
    and.push({ tags: { some: { tag: { slug: slugify(params.tag) } } } });
  }

  if (params.creator) {
    and.push({ creator: { username: params.creator } });
  }

  const where: Prisma.CharacterWhereInput = { AND: and };

  // "trending" needs a decayed score, so pull a bounded candidate pool and
  // rank in memory; the other sorts map straight onto indexed columns.
  if (params.sort === "trending") {
    const pool = await prisma.character.findMany({
      where,
      select: { ...characterCard, chatCount: true, likeCount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const ranked = pool
      .map((c) => ({ c, score: trendingScore(c) }))
      .sort((a, b) => b.score - a.score)
      .slice(params.offset, params.offset + params.limit)
      .map((r) => toCardView(r.c));
    return { items: ranked, total: pool.length };
  }

  const orderBy: Prisma.CharacterOrderByWithRelationInput =
    params.sort === "new"
      ? { createdAt: "desc" }
      : params.sort === "popular"
        ? { likeCount: "desc" }
        : { chatCount: "desc" };

  const [rows, total] = await Promise.all([
    prisma.character.findMany({
      where,
      select: characterCard,
      orderBy: [orderBy, { createdAt: "desc" }],
      skip: params.offset,
      take: params.limit,
    }),
    prisma.character.count({ where }),
  ]);

  return { items: rows.map(toCardView), total };
}

/** Creates missing tags and returns the join rows for a character. */
export async function resolveTags(names: string[]): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 10);
  const ids: string[] = [];

  for (const name of unique) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.tag.upsert({
      where: { slug },
      update: {},
      create: { name: name.slice(0, 30), slug },
    });
    ids.push(tag.id);
  }
  return ids;
}
