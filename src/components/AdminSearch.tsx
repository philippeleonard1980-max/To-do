"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Query box that preserves the other filters already in the URL. */
export function AdminSearch({ basePath, placeholder }: { basePath: string; placeholder: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="relative">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm transition placeholder:text-[var(--text-faint)] focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
      />
    </form>
  );
}
