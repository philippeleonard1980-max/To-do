import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { browseCharacters } from "@/lib/characters";
import { GroupBuilder } from "@/components/GroupBuilder";
import { PLAN_LIMITS } from "@/lib/constants";

export const metadata = { title: "New group chat" };
export const dynamic = "force-dynamic";

export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const withParam = params.with;
  const preselected = (Array.isArray(withParam) ? withParam : withParam ? [withParam] : []).filter(
    Boolean,
  );

  const { items } = await browseCharacters({
    sort: "trending",
    limit: 60,
    offset: 0,
    viewerId: viewer.id,
    includeMature: Boolean(viewer.allowMature && viewer.settings.showMature),
  });

  const maxSize = PLAN_LIMITS[viewer.plan].groupSize;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New group chat</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-dim">
          Put two or more characters in one room. They take turns, react to each other, and stay in
          their own voice — you can also hand the next line to whoever you want.
        </p>
      </header>

      <GroupBuilder characters={items} maxSize={maxSize} preselected={preselected} />
    </div>
  );
}
