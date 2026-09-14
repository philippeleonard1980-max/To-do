import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, MessageSquare, Users } from "lucide-react";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Badge, Button } from "@/components/ui";
import { CharacterActions } from "@/components/CharacterActions";
import { CharacterGrid } from "@/components/CharacterCard";
import { characterCard, toCardView } from "@/lib/characters";
import { RoleplayText } from "@/components/RoleplayText";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const character = await prisma.character.findUnique({
    where: { id },
    select: { name: true, tagline: true, visibility: true },
  });
  if (!character || character.visibility === "private") return { title: "Character" };
  return { title: character.name, description: character.tagline };
}

export default async function CharacterPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getViewer();

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } },
      tags: { select: { tag: true } },
    },
  });

  if (!character) notFound();

  const isOwner = character.creatorId === viewer?.id;
  if (character.visibility === "private" && !isOwner) notFound();

  // Mature characters are gated on a verified adult birthdate, not a checkbox.
  const blocked = character.isMature && !viewer?.isAdult;

  const [favorited, likeCount, more] = await Promise.all([
    viewer
      ? prisma.favorite.findUnique({
          where: { userId_characterId: { userId: viewer.id, characterId: id } },
        })
      : null,
    prisma.favorite.count({ where: { characterId: id } }),
    prisma.character.findMany({
      where: { creatorId: character.creatorId, visibility: "public", id: { not: id } },
      select: characterCard,
      orderBy: { chatCount: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            {character.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.avatarUrl}
                alt={character.name}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <Avatar
                name={character.name}
                accent={character.accent}
                size="xl"
                rounded="xl"
                className="aspect-square h-auto w-full rounded-none"
              />
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-faint">
            <span className="flex items-center gap-1.5">
              <MessageSquare size={13} /> {character.chatCount}
            </span>
            <span className="flex items-center gap-1.5">
              <Eye size={13} /> {character.viewCount}
            </span>
          </div>

          <Link
            href={`/u/${character.creator.username}`}
            className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-3 transition hover:border-violet-500/50"
          >
            <Avatar
              name={character.creator.displayName}
              src={character.creator.avatarUrl}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{character.creator.displayName}</p>
              <p className="truncate text-[11px] text-faint">@{character.creator.username}</p>
            </div>
          </Link>
        </aside>

        <div className="min-w-0 space-y-6">
          <header>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{character.name}</h1>
              {character.isMature && <Badge tone="warn">18+</Badge>}
              {character.visibility !== "public" && <Badge>{character.visibility}</Badge>}
            </div>
            {character.tagline && <p className="text-base text-dim">{character.tagline}</p>}
          </header>

          {character.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {character.tags.map(({ tag }) => (
                <Link key={tag.slug} href={`/?tag=${tag.slug}`}>
                  <Badge tone="accent" className="transition hover:bg-violet-500/25">
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          {blocked ? (
            <div className="rounded-2xl border border-[var(--tone-warn-border)] bg-[var(--tone-warn-bg)] p-5">
              <h2 className="text-sm font-semibold text-[var(--tone-warn-strong)]">This character is marked 18+</h2>
              <p className="mt-1.5 text-sm text-[var(--tone-warn-text)]">
                Confirm your date of birth in settings to open it. Mature here means adult themes
                — dark subject matter and adult relationships — handled with restraint, not
                explicit content.
              </p>
              <Link href={viewer ? "/settings" : "/register"} className="mt-4 inline-block">
                <Button size="sm" variant="outline">
                  {viewer ? "Go to settings" : "Create an account"}
                </Button>
              </Link>
            </div>
          ) : (
            <CharacterActions
              characterId={character.id}
              initialFavorited={Boolean(favorited)}
              initialLikes={likeCount}
              isOwner={isOwner}
              signedIn={Boolean(viewer)}
            />
          )}

          {character.description && (
            <Section title="About">
              <p className="whitespace-pre-wrap leading-relaxed text-dim">{character.description}</p>
            </Section>
          )}

          {character.greeting && !blocked && (
            <Section title="How they open">
              <div className="rp rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-sm leading-relaxed">
                <RoleplayText text={character.greeting} />
              </div>
            </Section>
          )}

          {isOwner && character.personality && (
            <Section title="Personality (only you can see this)">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-dim">
                {character.personality}
              </p>
            </Section>
          )}

          {isOwner && character.scenario && (
            <Section title="Scenario (only you can see this)">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-dim">
                {character.scenario}
              </p>
            </Section>
          )}

          {viewer && !blocked && (
            <Link href={`/group?with=${character.id}`}>
              <Button variant="outline" size="sm">
                <Users size={15} /> Add to a group chat
              </Button>
            </Link>
          )}
        </div>
      </div>

      {more.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-sm font-semibold text-dim">
            More from {character.creator.displayName}
          </h2>
          <CharacterGrid characters={more.map(toCardView)} />
        </section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
