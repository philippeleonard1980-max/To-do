import { notFound } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Button, EmptyState } from "@/components/ui";
import { CharacterGrid } from "@/components/CharacterCard";
import { FollowButton } from "@/components/FollowButton";
import { characterCard, toCardView } from "@/lib/characters";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params) {
  const { username } = await params;
  const user = await prisma.user.findUnique({ where: { username }, select: { displayName: true } });
  return { title: user?.displayName ?? "Creator" };
}

export default async function ProfilePage({ params }: Params) {
  const { username } = await params;
  const viewer = await getViewer();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) notFound();

  const isSelf = viewer?.id === user.id;

  const [characters, followerCount, followingCount, following] = await Promise.all([
    prisma.character.findMany({
      where: { creatorId: user.id, ...(isSelf ? {} : { visibility: "public" }) },
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={user.displayName} src={user.avatarUrl} size="xl" />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{user.displayName}</h1>
          <p className="text-sm text-faint">@{user.username}</p>
          {user.bio && <p className="mt-3 max-w-xl text-sm leading-relaxed text-dim">{user.bio}</p>}

          <div className="mt-3 flex gap-5 text-sm">
            <span>
              <strong className="tabular-nums">{characters.length}</strong>{" "}
              <span className="text-faint">characters</span>
            </span>
            <span>
              <strong className="tabular-nums">{followerCount}</strong>{" "}
              <span className="text-faint">followers</span>
            </span>
            <span>
              <strong className="tabular-nums">{followingCount}</strong>{" "}
              <span className="text-faint">following</span>
            </span>
          </div>
        </div>

        <div className="shrink-0">
          {isSelf ? (
            <Link href="/settings">
              <Button variant="outline">Edit profile</Button>
            </Link>
          ) : (
            <FollowButton
              username={user.username}
              initialFollowing={Boolean(following)}
              signedIn={Boolean(viewer)}
            />
          )}
        </div>
      </header>

      {characters.length === 0 ? (
        <EmptyState
          title={isSelf ? "You haven't made anything yet" : "No public characters yet"}
          description={
            isSelf ? "Your first character takes about five minutes." : "Check back another time."
          }
          action={
            isSelf ? (
              <Link href="/create">
                <Button>Create a character</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <CharacterGrid characters={characters.map(toCardView)} />
      )}
    </div>
  );
}
