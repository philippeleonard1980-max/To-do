"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Compass,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  User,
  Users,
  Menu,
  X,
} from "lucide-react";
import clsx from "clsx";

import { Avatar } from "./Avatar";
import { Badge, Button } from "./ui";
import type { Viewer } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/personas", label: "Personas", icon: Users },
];

export function SiteHeader({ viewer, mockProvider }: { viewer: Viewer | null; mockProvider: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // The chat view manages its own full-height layout and hides the chrome.
  if (pathname?.startsWith("/chat/")) return null;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-rose-500">
            <Sparkles size={15} className="text-white" />
          </span>
          <span className="hidden sm:inline">AI Talk</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition",
                  active
                    ? "bg-white/[0.08] font-medium text-[var(--text)]"
                    : "text-dim hover:bg-white/5 hover:text-[var(--text)]",
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {mockProvider && (
          <Link href="/settings" className="hidden lg:block" title="No API key configured">
            <Badge tone="warn">Demo model</Badge>
          </Link>
        )}

        {viewer ? (
          <>
            <Link href="/create" className="hidden sm:block">
              <Button size="sm" variant="outline">
                <Plus size={15} /> Create
              </Button>
            </Link>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="ml-1 flex items-center gap-2 rounded-full p-0.5 transition hover:bg-white/5"
              >
                <Avatar name={viewer.displayName} src={viewer.avatarUrl} size="sm" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-overlay)] shadow-2xl shadow-black/50"
                >
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <p className="truncate text-sm font-medium">{viewer.displayName}</p>
                    <p className="truncate text-xs text-faint">@{viewer.username}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <Badge tone="accent">{viewer.plan}</Badge>
                      <span className="text-faint tabular-nums">{viewer.credits} credits</span>
                    </div>
                  </div>
                  <MenuLink href={`/u/${viewer.username}`} icon={<User size={15} />}>
                    My profile
                  </MenuLink>
                  <MenuLink href="/create" icon={<Plus size={15} />}>
                    Create a character
                  </MenuLink>
                  <MenuLink href="/pricing" icon={<Sparkles size={15} />}>
                    Plans &amp; credits
                  </MenuLink>
                  <MenuLink href="/settings" icon={<Settings size={15} />}>
                    Settings
                  </MenuLink>
                  <button
                    onClick={signOut}
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 border-t border-[var(--border)] px-4 py-2.5 text-left text-sm text-dim transition hover:bg-white/5 hover:text-[var(--text)]"
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button size="sm" variant="ghost">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        )}

        <button
          onClick={() => setNavOpen((v) => !v)}
          className="ml-1 rounded-lg p-2 text-dim transition hover:bg-white/5 md:hidden"
          aria-label={navOpen ? "Close menu" : "Open menu"}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {navOpen && (
        <nav className="border-t border-[var(--border)] px-4 py-2 md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-dim transition hover:bg-white/5 hover:text-[var(--text)]"
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
          {viewer && (
            <Link
              href="/create"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-dim transition hover:bg-white/5 hover:text-[var(--text)]"
            >
              <Plus size={16} /> Create a character
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-dim transition hover:bg-white/5 hover:text-[var(--text)]"
    >
      {icon}
      {children}
    </Link>
  );
}
