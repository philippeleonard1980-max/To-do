/** SQLite stores our JSON columns as text; these helpers keep that contained. */

export function parseJson<T extends object>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...fallback, ...(parsed as Partial<T>) };
    }
  } catch {
    // Corrupt or hand-edited rows fall back to defaults rather than 500ing.
  }
  return fallback;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}
