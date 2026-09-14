import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { json, notFound, route } from "@/lib/api";
import { characterCard, toCardView } from "@/lib/characters";

export const runtime = "nodejs";

type Params = { params: Promise<{ username: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { username } = await params;
  const viewer = await getViewer();

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, createdAt: true },
  });
  if (!user) throw notFound("No such creator.");

  const isSelf = viewer?.id === user.id;

  const [characters, followerCount, followingCount, following] = await Promise.all([
    prisma.character.findMany({
      where: {
        creatorId: user.id,
        ...(isSelf ? {} : { visibility: "public" }),
      },
      select: characterCard,
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    viewer
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewer.id, followingId: user.id } },
        })
      : null,
  ]);

  return json({
    user: { ...user, createdAt: user.createdAt.toISOString() },
    characters: characters.map(toCardView),
    followerCount,
    followingCount,
    following: Boolean(following),
    isSelf,
  });
});
