/**
 * Creates .env on first run.
 *
 * .env is gitignored, so a fresh clone has none and Prisma fails with a bare
 * "Environment variable not found: DATABASE_URL". Rather than making that a
 * documented manual step people miss, bootstrap it from .env.example.
 *
 * AUTH_SECRET is replaced with a freshly generated value instead of copying
 * the placeholder, so no two installs share a session signing key.
 */

import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (existsSync(envPath)) {
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error("No .env and no .env.example to copy from — cannot continue.");
  process.exit(1);
}

copyFileSync(examplePath, envPath);

// Give this install its own session signing key.
const secret = randomBytes(48).toString("base64");
const contents = readFileSync(envPath, "utf8").replace(
  /^AUTH_SECRET=.*$/m,
  `AUTH_SECRET="${secret}"`,
);
writeFileSync(envPath, contents);

console.log("Created .env from .env.example, with a freshly generated AUTH_SECRET.");
console.log("Add ANTHROPIC_API_KEY or GEMINI_API_KEY there for real replies.");
