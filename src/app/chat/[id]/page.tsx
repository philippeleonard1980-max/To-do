import { notFound, redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChatView } from "@/components/ChatView";
import { currentMemory, loadChat, loadMessages, resolveChatSettings } from "@/lib/chat-service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  let chat;
  try {
    chat = await loadChat(id, viewer);
  } catch {
    notFound();
  }

  const [messages, memory, personas] = await Promise.all([
    loadMessages(id),
    currentMemory(id),
    prisma.persona.findMany({
      where: { userId: viewer.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, avatarUrl: true },
    }),
  ]);

  return (
    <ChatView
      chat={{
        id: chat.id,
        title: chat.title,
        mode: chat.mode,
        personaId: chat.personaId,
        persona: chat.persona ? { id: chat.persona.id, name: chat.persona.name } : null,
        settings: resolveChatSettings(chat.settings, viewer),
        characters: chat.participants.map((p) => ({
          id: p.character.id,
          name: p.character.name,
          avatarUrl: p.character.avatarUrl,
          accent: p.character.accent,
          tagline: p.character.tagline,
        })),
      }}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        characterId: m.characterId,
        authorName: m.authorName,
        activeVariant: m.activeVariant,
        variantCount: m.variantCount,
        createdAt: m.createdAt.toISOString(),
      }))}
      memory={memory?.summary ?? null}
      personas={personas}
      viewer={{
        displayName: viewer.displayName,
        avatarUrl: viewer.avatarUrl,
        credits: viewer.credits,
        plan: viewer.plan,
      }}
    />
  );
}
