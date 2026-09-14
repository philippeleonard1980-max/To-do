import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { CharacterForm } from "@/components/CharacterForm";

export const metadata = { title: "Edit character" };
export const dynamic = "force-dynamic";

export default async function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const character = await prisma.character.findUnique({
    where: { id },
    include: { tags: { select: { tag: { select: { name: true } } } } },
  });

  if (!character) notFound();
  if (character.creatorId !== viewer.id) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Edit {character.name}</h1>
        <p className="mt-1.5 text-sm text-dim">
          Changes apply to new replies. Conversations already under way keep their history.
        </p>
      </header>
      <CharacterForm
        mode="edit"
        initial={{
          id: character.id,
          name: character.name,
          tagline: character.tagline,
          description: character.description,
          personality: character.personality,
          scenario: character.scenario,
          greeting: character.greeting,
          exampleDialogue: character.exampleDialogue,
          systemPromptOverride: character.systemPromptOverride ?? "",
          avatarUrl: character.avatarUrl ?? "",
          accent: character.accent,
          visibility: character.visibility,
          isMature: character.isMature,
          tags: character.tags.map((t) => t.tag.name),
        }}
      />
    </div>
  );
}
