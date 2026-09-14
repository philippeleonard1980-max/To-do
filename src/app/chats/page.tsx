import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Users } from "lucide-react";

import { getViewer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { Badge, Button, EmptyState } from "@/components/ui";

export const metadata = { title: "Your chats" };
export const dynamic = "force-dynamic";

function relative(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ChatsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const chats = await prisma.chat.findMany({
    where: { userId: viewer.id, archived: false },
    orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
    include: {
      participants: {
        include: { character: { select: { id: true, name: true, avatarUrl: true, accent: true } } },
        orderBy: { order: "asc" },
      },
      messages: {
        orderBy: { position: "desc" },
        take: 1,
        include: { variants: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your chats</h1>
          <p className="mt-1 text-sm text-dim">
            {chats.length} {chats.length === 1 ? "conversation" : "conversations"}
          </p>
        </div>
        <Link href="/group">
          <Button variant="outline" size="sm">
            <Users size={15} /> New group
          </Button>
        </Link>
      </header>

      {chats.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No conversations yet"
          description="Find a character you like and start talking. Everything you say is saved here."
          action={
            <Link href="/">
              <Button>Browse characters</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-1.5">
          {chats.map((chat) => {
            const last = chat.messages[0];
            const active = last?.variants.find((v) => v.index === last.activeVariant) ?? last?.variants[0];
            const preview = active?.content.replace(/\*/g, "").replace(/\s+/g, " ").trim() ?? "";

            return (
              <li key={chat.id}>
                <Link
                  href={`/chat/${chat.id}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 transition hover:border-violet-500/50"
                >
                  <div className="flex -space-x-2">
                    {chat.participants.slice(0, 2).map((p) => (
                      <Avatar
                        key={p.character.id}
                        name={p.character.name}
                        src={p.character.avatarUrl}
                        accent={p.character.accent}
                        size="md"
                        className="ring-2 ring-[var(--surface-raised)]"
                      />
                    ))}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{chat.title}</p>
                      {chat.mode === "group" && <Badge>group</Badge>}
                    </div>
                    <p className="truncate text-xs text-faint">{preview || "No messages yet"}</p>
                  </div>

                  <span className="shrink-0 text-[11px] text-faint">
                    {relative(chat.lastMessageAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
