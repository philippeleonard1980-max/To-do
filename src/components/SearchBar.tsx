"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchBar({ placeholder = "Search characters…" }: { placeholder?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  // Keep the field in step when navigation changes the query string.
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    next.delete("cursor");
    router.push(`/?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="relative w-full">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search characters"
        className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] pl-10 pr-10 text-sm transition placeholder:text-[var(--text-faint)] focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            const next = new URLSearchParams(params.toString());
            next.delete("q");
            router.push(`/?${next.toString()}`);
          }}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] transition hover:text-[var(--text)]"
        >
          <X size={15} />
        </button>
      )}
    </form>
  );
}
