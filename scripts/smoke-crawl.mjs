/**
 * End-to-end smoke crawl.
 *
 * Visits every route signed out and signed in, sends a real chat message, and
 * reports page errors, console errors, failed requests, 5xx responses, blank
 * renders and horizontal overflow.
 *
 *   npm run build && npm start &
 *   BASE=http://localhost:3000 npm run smoke
 *
 * Env: BASE, OUT (screenshot dir), THEME=dark|light, MOBILE=1.
 *
 * Note: Next.js aborts in-flight RSC prefetches on navigation, which surface
 * as REQ_FAILED entries with `_rsc=` in the URL. Those are expected and are
 * filtered when you read problems-*.json.
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3300";
const OUT = process.env.OUT ?? "/tmp/shots";
const THEME = process.env.THEME ?? "dark";
const VIEWPORT = process.env.MOBILE === "1" ? { width: 390, height: 844 } : { width: 1360, height: 900 };
const TAG = `${THEME}-${process.env.MOBILE === "1" ? "mobile" : "desktop"}`;

mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (kind, route, detail) => {
  problems.push({ kind, route, detail: String(detail).slice(0, 400), tag: TAG });
  console.log(`  [${kind}] ${route}: ${String(detail).slice(0, 220)}`);
};

// Requests that are expected to fail and are not defects.
const IGNORED_REQUEST = [/favicon\.ico/];
// Console noise that is not a defect.
const IGNORED_CONSOLE = [/Download the React DevTools/i, /\[Fast Refresh\]/i];

// PLAYWRIGHT_CHROMIUM lets a sandboxed environment point at a preinstalled
// browser; otherwise Playwright resolves its own download.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: THEME === "light" ? "light" : "dark" });
const page = await context.newPage();

let currentRoute = "(startup)";
page.on("pageerror", (e) => note("PAGE_ERROR", currentRoute, e.message));
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  const text = m.text();
  if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
  note(m.type() === "error" ? "CONSOLE_ERROR" : "CONSOLE_WARN", currentRoute, text);
});
page.on("requestfailed", (r) => {
  if (IGNORED_REQUEST.some((re) => re.test(r.url()))) return;
  note("REQ_FAILED", currentRoute, `${r.url()} ${r.failure()?.errorText ?? ""}`);
});
page.on("response", (r) => {
  if (r.status() >= 500) note("HTTP_5XX", currentRoute, `${r.status()} ${r.url()}`);
});

async function visit(route, name, { expectStatus = 200 } = {}) {
  currentRoute = route;
  try {
    const response = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
    const status = response?.status() ?? 0;
    if (status >= 400 && status !== expectStatus) note("HTTP_ERROR", route, `status ${status}`);

    // A page that renders nothing is a crash we would otherwise miss.
    const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
    if (bodyText.length < 20) note("EMPTY_PAGE", route, `body text length ${bodyText.length}`);
    if (/Application error|client-side exception|Internal Server Error/i.test(bodyText)) {
      note("RENDER_CRASH", route, bodyText.slice(0, 200));
    }

    // Horizontal overflow makes a page unusable on mobile.
    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (overflow > 4) note("H_OVERFLOW", route, `${overflow}px wider than viewport`);

    await page.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: false });
  } catch (e) {
    note("NAV_FAILED", route, e.message);
  }
}

// --- signed out -----------------------------------------------------------
console.log(`\n=== ${TAG}: signed out ===`);
for (const [route, name] of [["/", "01-discover"], ["/login", "02-login"], ["/register", "03-register"]]) {
  await visit(route, `out-${name}`);
}

// Grab a real character id from the seeded catalogue.
currentRoute = "/api/characters";
const listing = await page.evaluate(async (base) => {
  const r = await fetch(base + "/api/characters?limit=3");
  return r.json();
}, BASE);
const charId = listing.items?.[0]?.id;
const creator = listing.items?.[0]?.creator?.username;
if (!charId) note("DATA", "/api/characters", "no seeded characters returned");

if (charId) await visit(`/character/${charId}`, "out-04-character");
if (creator) await visit(`/u/${creator}`, "out-05-profile");
await visit("/?sort=new", "out-06-sort");
await visit("/?q=archivist", "out-07-search");
await visit("/?tag=mystery", "out-08-tag");
await visit("/nope-does-not-exist", "out-09-404", { expectStatus: 404 });
await visit("/character/bogus-id", "out-10-char404", { expectStatus: 404 });

// --- register + signed in -------------------------------------------------
console.log(`\n=== ${TAG}: signed in ===`);
const email = `crawl-${TAG}-${Date.now()}@test.local`;
currentRoute = "/register";
await page.goto(BASE + "/register", { waitUntil: "networkidle" });
await page.fill('input[autocomplete="nickname"]', "Crawl Bot");
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', "crawlpassword123");
await page.fill('input[type="date"]', "1990-05-05");
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes("register"), { timeout: 30000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
if (page.url().includes("/register")) note("AUTH", "/register", "registration did not navigate away");

for (const [route, name] of [
  ["/", "11-discover"],
  ["/chats", "12-chats"],
  ["/personas", "13-personas"],
  ["/settings", "14-settings"],
  ["/pricing", "15-pricing"],
  ["/create", "16-create"],
  ["/group", "17-group"],
]) {
  await visit(route, `in-${name}`);
}
if (charId) await visit(`/character/${charId}`, "in-18-character");

// --- an actual chat, the highest-risk surface ------------------------------
if (charId) {
  currentRoute = "/chat (create)";
  const chat = await page.evaluate(async ({ base, id }) => {
    const r = await fetch(base + "/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterIds: [id] }),
    });
    return { status: r.status, body: await r.json() };
  }, { base: BASE, id: charId });

  if (chat.status !== 201) {
    note("API", "/api/chats", `status ${chat.status} ${JSON.stringify(chat.body)}`);
  } else {
    await visit(`/chat/${chat.body.id}`, "in-19-chat");

    // Send a message and watch the stream land in the DOM.
    currentRoute = "/chat (send)";
    try {
      await page.fill("textarea", "Hello, are you there?");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(6000);
      const bubbles = await page.locator(".rp").count();
      if (bubbles < 2) note("CHAT", "/chat", `expected >=2 rendered messages, saw ${bubbles}`);
      const text = await page.locator("body").innerText();
      if (/Couldn't|failed|error/i.test(text) && !/findahelpline/.test(text)) {
        note("CHAT", "/chat", "error text visible after sending");
      }
      await page.screenshot({ path: `${OUT}/${TAG}-in-20-chat-streamed.png` });

      // Settings drawer is a separate render path worth exercising.
      await page.click('button[aria-label="Chat settings"]').catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${TAG}-in-21-chat-settings.png` });
    } catch (e) {
      note("CHAT", "/chat", e.message);
    }
  }
}

writeFileSync(`${OUT}/problems-${TAG}.json`, JSON.stringify(problems, null, 2));
console.log(`\n=== ${TAG}: ${problems.length} problem(s) ===`);
await browser.close();
