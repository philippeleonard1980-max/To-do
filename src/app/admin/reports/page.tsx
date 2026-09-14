import Link from "next/link";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { Badge } from "@/components/ui";
import { ReportActions } from "@/components/AdminActions";

export const dynamic = "force-dynamic";

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Re-checked here, not just in the layout: layouts and pages render in
  // parallel, so a layout-only gate still lets this page query and stream.
  await requireAdmin();
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = ["open", "reviewed", "dismissed"].includes(raw ?? "") ? raw! : "open";

  const reports = await prisma.report.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: { select: { username: true } },
      character: { select: { id: true, name: true, visibility: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {["open", "reviewed", "dismissed"].map((option) => (
          <Link
            key={option}
            href={`/admin/reports?status=${option}`}
            className={`rounded-lg px-3 py-1.5 text-xs capitalize transition ${
              status === option
                ? "bg-violet-600 text-white"
                : "border border-[var(--border)] text-dim hover:text-[var(--text)]"
            }`}
          >
            {option}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center text-sm text-faint">
          Nothing in the {status} queue.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{report.reason}</span>
                    {report.character && (
                      <Link
                        href={`/character/${report.character.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300"
                      >
                        {report.character.name} →
                      </Link>
                    )}
                    {report.character?.visibility !== "public" && report.character && (
                      <Badge>{report.character.visibility}</Badge>
                    )}
                  </div>
                  {report.detail && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-dim">
                      {report.detail}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-faint">
                    reported by @{report.reporter.username} ·{" "}
                    {report.createdAt.toLocaleString()}
                  </p>
                </div>

                {status === "open" && <ReportActions id={report.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
