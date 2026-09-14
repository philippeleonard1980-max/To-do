import { prisma } from "@/lib/db";
import { json, route } from "@/lib/api";

export const runtime = "nodejs";

/** Tag cloud for the discover page, ordered by how many characters use each. */
export const GET = route(async () => {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { characters: true } } },
  });

  const items = tags
    .map((t) => ({ name: t.name, slug: t.slug, group: t.group, count: t._count.characters }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  return json({ items });
});
