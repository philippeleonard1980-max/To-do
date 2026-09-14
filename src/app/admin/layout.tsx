import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/characters", label: "Characters" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Gates every page under /admin. requireAdmin throws a 404 rather than a 403
  // so the panel's existence isn't disclosed to non-admins.
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-violet-400" />
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        </div>
        <p className="mt-1 text-sm text-dim">
          Moderation and instance management. Every action here is written to the audit log.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-sm text-dim transition hover:bg-[var(--overlay-weak)] hover:text-[var(--text)]"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
