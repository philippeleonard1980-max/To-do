"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, Flag, MessageSquare, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";

import { Alert, Button } from "./ui";

export function CharacterActions({
  characterId,
  initialFavorited,
  initialLikes,
  isOwner,
  signedIn,
}: {
  characterId: string;
  initialFavorited: boolean;
  initialLikes: number;
  isOwner: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [likes, setLikes] = useState(initialLikes);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  async function startChat() {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: [characterId] }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Couldn't start the chat.");
        return;
      }
      router.push(`/chat/${data.id}`);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setStarting(false);
    }
  }

  async function toggleFavorite() {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    // Optimistic: flip immediately, reconcile with the server's count after.
    setFavorited((v) => !v);
    setLikes((n) => n + (favorited ? -1 : 1));

    const response = await fetch(`/api/characters/${characterId}/favorite`, { method: "POST" });
    if (response.ok) {
      const data = await response.json();
      setFavorited(data.favorited);
      setLikes(data.likeCount);
    } else {
      setFavorited(favorited);
      setLikes(likes);
    }
  }

  async function remove() {
    if (!confirm("Delete this character? Chats that use it will lose it. This can't be undone.")) return;
    const response = await fetch(`/api/characters/${characterId}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Couldn't delete that.");
    }
  }

  async function report() {
    const reason = prompt("What's wrong with this character?");
    if (!reason?.trim()) return;
    setReporting(true);
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId, reason: reason.slice(0, 60), detail: reason }),
    });
    setReporting(false);
    if (response.ok) alert("Thanks — this has been sent to the moderation queue.");
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={startChat} loading={starting} className="flex-1 sm:flex-none">
          <MessageSquare size={17} /> Start chatting
        </Button>

        <Button
          size="lg"
          variant="outline"
          onClick={toggleFavorite}
          aria-pressed={favorited}
          aria-label={favorited ? "Remove from favourites" : "Add to favourites"}
        >
          <Heart
            size={17}
            className={clsx(favorited && "fill-rose-500 text-rose-500")}
          />
          <span className="tabular-nums">{likes}</span>
        </Button>

        {isOwner ? (
          <>
            <Button size="lg" variant="outline" onClick={() => router.push(`/character/${characterId}/edit`)}>
              <Pencil size={16} /> Edit
            </Button>
            <Button size="lg" variant="ghost" onClick={remove} aria-label="Delete character">
              <Trash2 size={16} />
            </Button>
          </>
        ) : (
          signedIn && (
            <Button size="lg" variant="ghost" onClick={report} loading={reporting} aria-label="Report character">
              <Flag size={16} />
            </Button>
          )
        )}
      </div>
    </div>
  );
}
