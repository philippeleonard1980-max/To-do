import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PersonaManager } from "@/components/PersonaManager";
import { PLAN_LIMITS } from "@/lib/constants";

export const metadata = { title: "Personas" };
export const dynamic = "force-dynamic";

export default async function PersonasPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const personas = await prisma.persona.findMany({
    where: { userId: viewer.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const limit = PLAN_LIMITS[viewer.plan].personas;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-dim">
          A persona is who <em>you</em> are in a scene. Characters address it by name and take what
          you write here as established fact. Switch personas per chat from the settings panel.
        </p>
      </header>

      <PersonaManager
        initial={personas.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          avatarUrl: p.avatarUrl,
          isDefault: p.isDefault,
        }))}
        limit={Number.isFinite(limit) ? limit : 999}
      />
    </div>
  );
}
