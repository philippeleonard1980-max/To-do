import { notFound, redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { loadChat, loadMessages } from "@/lib/chat-service";
import { LiveCompanion } from "@/components/LiveCompanion";
import { parseJson } from "@/lib/json";
import { DEFAULT_VOICE, type VoiceSettings } from "@/lib/speech";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live" };

/**
 * Live mode: the voice-first view of an existing chat.
 *
 * It reuses the same chat, persona, memory and message pipeline as the text
 * view — Live is a different surface onto one conversation, not a separate
 * one, so anything said here shows up in the transcript and vice versa.
 */
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/live/${id}`)}`);

  let chat;
  try {
    chat = await loadChat(id, viewer);
  } catch {
    notFound();
  }

  const character = chat.participants[0]?.character;
  if (!character) notFound();

  const messages = await loadMessages(id);
  const lastLine = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null;

  return (
    <LiveCompanion
      chatId={chat.id}
      greeting={lastLine}
      character={{
        id: character.id,
        name: character.name,
        accent: character.accent,
        tagline: character.tagline,
        voice: parseJson<VoiceSettings>(character.voice, DEFAULT_VOICE),
      }}
    />
  );
}
