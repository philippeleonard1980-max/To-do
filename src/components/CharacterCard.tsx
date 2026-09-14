import Link from "next/link";
import { Heart, MessageSquare } from "lucide-react";

import { Avatar } from "./Avatar";
import { Badge } from "./ui";
import type { CardView } from "@/lib/characters";

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export function CharacterCard({ character }: { character: CardView }) {
  return (
    <Link
      href={`/character/${character.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] transition hover:-translate-y-0.5 hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-950/30"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {character.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.avatarUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <Avatar
            name={character.name}
            accent={character.accent}
            size="xl"
            rounded="xl"
            className="h-full w-full rounded-none"
          />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3 pt-10">
          <h3 className="truncate text-sm font-semibold text-white">{character.name}</h3>
          {character.tagline && (
            <p className="truncate text-xs text-white/65">{character.tagline}</p>
          )}
        </div>

        {character.isMature && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur">
            18+
          </span>
        )}
        {character.visibility !== "public" && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur">
            {character.visibility}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5 text-[11px] text-faint">
        <span className="flex items-center gap-1" title={`${character.chatCount} chats`}>
          <MessageSquare size={12} /> {compact(character.chatCount)}
        </span>
        <span className="flex items-center gap-1" title={`${character.likeCount} likes`}>
          <Heart size={12} /> {compact(character.likeCount)}
        </span>
        <span className="ml-auto truncate">@{character.creator.username}</span>
      </div>

      {character.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {character.tags.slice(0, 3).map((tag) => (
            <Badge key={tag.slug}>{tag.name}</Badge>
          ))}
        </div>
      )}
    </Link>
  );
}

export function CharacterGrid({ characters }: { characters: CardView[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {characters.map((character) => (
        <CharacterCard key={character.id} character={character} />
      ))}
    </div>
  );
}
