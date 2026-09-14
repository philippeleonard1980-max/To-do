"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Users } from "lucide-react";
import clsx from "clsx";

import { Alert, Button, Input } from "./ui";
import { Avatar } from "./Avatar";
import type { CardView } from "@/lib/characters";

export function GroupBuilder({
  characters,
  maxSize,
  preselected,
}: {
  characters: CardView[];
  maxSize: number;
  preselected: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(preselected.slice(0, maxSize));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = query.trim()
    ? characters.filter((c) =>
        `${c.name} ${c.tagline}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : characters;

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxSize) {
        setError(`Your plan allows ${maxSize} characters in one room.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function start() {
    if (selected.length < 2) {
      setError("Pick at least two characters for a group chat.");
      return;
    }
    setBusy(true);
    setError(null);

    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterIds: selected, mode: "group" }),
    });

    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Couldn't start that chat.");
      return;
    }
    router.push(`/chat/${data.id}`);
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter characters…"
          className="sm:flex-1"
        />
        <Button onClick={start} loading={busy} disabled={selected.length < 2}>
          <Users size={16} /> Start group chat ({selected.length}/{maxSize})
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-3">
          <span className="text-xs text-faint">In the room:</span>
          {selected.map((id) => {
            const character = characters.find((c) => c.id === id);
            if (!character) return null;
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="flex items-center gap-1.5 rounded-full bg-violet-500/15 py-1 pl-1 pr-2.5 text-xs text-violet-200 transition hover:bg-violet-500/25"
              >
                <Avatar
                  name={character.name}
                  src={character.avatarUrl}
                  accent={character.accent}
                  size="xs"
                />
                {character.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((character) => {
          const active = selected.includes(character.id);
          return (
            <button
              key={character.id}
              onClick={() => toggle(character.id)}
              aria-pressed={active}
              className={clsx(
                "relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition",
                active
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[var(--border)] hover:border-violet-500/50",
              )}
            >
              <Avatar
                name={character.name}
                src={character.avatarUrl}
                accent={character.accent}
                size="md"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{character.name}</span>
                <span className="block truncate text-[11px] text-faint">{character.tagline}</span>
              </span>
              {active && (
                <span className="absolute right-2 top-2 rounded-full bg-violet-600 p-0.5 text-white">
                  <Check size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-faint">Nothing matched that.</p>
      )}
    </div>
  );
}
