/** URL/handle-safe slug. Always returns a non-empty string. */
export function slugify(input: string, fallback = "item"): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

/** Turns an email or display name into a candidate username. */
export function usernameFromEmail(email: string): string {
  return slugify(email.split("@")[0] ?? "", "user");
}
