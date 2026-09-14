import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { badRequest, json, notFound, route } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ username: string }> };

export const POST = route(async (_request: Request, { params }: Params) => {
  const { username } = await params;
  const viewer = await requireViewer();

  const target = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!target) throw notFound("No such creator.");
  if (target.id === viewer.id) throw badRequest("You can't follow yourself.");

  const key = { followerId_followingId: { followerId: viewer.id, followingId: target.id } };
  const existing = await prisma.follow.findUnique({ where: key });

  if (existing) {
    await prisma.follow.delete({ where: key });
  } else {
    await prisma.follow.create({ data: { followerId: viewer.id, followingId: target.id } });
  }

  const followerCount = await prisma.follow.count({ where: { followingId: target.id } });
  return json({ following: !existing, followerCount });
});
