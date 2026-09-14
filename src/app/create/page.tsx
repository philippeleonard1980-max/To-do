import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { CharacterForm, EMPTY_DRAFT } from "@/components/CharacterForm";

export const metadata = { title: "Create a character" };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create a character</h1>
        <p className="mt-1.5 text-sm text-dim">
          The more specific you are, the better they talk. Contradictions and small habits do
          more than adjectives.
        </p>
      </header>
      <CharacterForm initial={EMPTY_DRAFT} mode="create" />
    </div>
  );
}
