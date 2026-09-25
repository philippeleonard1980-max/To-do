# AI Talk

An AI character chat and roleplay platform. Write characters, give them a
voice and a past, and hold a conversation that remembers. Built with Next.js,
Prisma and the Anthropic API — and it runs end to end with no API key at all,
on a built-in offline model, so you can click through everything before
spending a cent.

```bash
npm install
npm run setup      # writes .env, creates the database, seeds sample data
npm run dev        # http://localhost:3000
```

On Windows PowerShell, run each line separately — `&&` is not a valid
separator there.

`npm run setup` creates `.env` for you from `.env.example` on first run, with
a freshly generated `AUTH_SECRET`, so no two installs share a signing key. It
is safe to re-run: an existing `.env` is never overwritten.

Sign in as **demo@aitalk.local** / **demo1234**, or create your own account.

---

## What's in it

**Characters**
- Full authoring: name, tagline, public description, personality, scene,
  opening message, few-shot example dialogue, avatar upload or accent colour.
- `{{user}}` / `{{char}}` macros (and the `<USER>` / `<BOT>` variants) so
  character cards written elsewhere behave sensibly.
- Advanced mode: replace the generated system prompt entirely. Safety rules
  are still appended after it.
- Visibility: public, unlisted, or private. Tags, likes, view and chat counts.

**Discovery**
- Trending, newest, most liked and most chatted, plus full-text search,
  tag filtering and pagination.
- Trending is Reddit-style — engagement on a log scale minus a linear time
  penalty — so it surfaces what's rising rather than restating "most chatted".

**Chat**
- Token-by-token streaming over server-sent events, with a stop button.
- **Regenerate and swipe**: every regeneration is stored as a variant on the
  same turn, and you can page back and forth between them.
- Edit any message in place; delete one message, or rewind the scene by
  deleting everything from a point onward.
- **Rolling memory**: once a conversation outgrows its context window, older
  turns are folded into a running summary, shown in the transcript so you can
  see what the character actually retained.
- Per-chat model, creativity and reply-length overrides.

**Personas**
- Define who *you* are in a scene — name and background the character treats
  as established fact. Multiple personas, a default, and per-chat switching.

**Group chats**
- Put 2–6 characters in one room. Turn-taking is automatic: whoever you
  address by name goes next, otherwise it round-robins. You can also hand the
  next line to a specific character.

**Accounts and social**
- Email/password auth with JWT cookie sessions, creator profiles, following.
- Plans (Free / Plus / Pro) with a monthly message-credit quota, per-model
  pricing, gated model access and feature ceilings.

**Live mode** (`/live/:chatId`) — voice-first, with a 3D character
- Speak to her and she answers out loud. Mic in via the Web Speech API, reply
  streamed from the same pipeline as the text chat, spoken back with speech
  synthesis. Barge-in works: start talking and she stops.
- An original 3D character, built procedurally from Three.js primitives — no
  model files to download or license. She breathes, blinks, tracks your
  cursor, and her mouth is driven by the words actually being spoken.
- Per-character pitch and pace, so each one has a distinct read.
- Live and the text chat are two views of one conversation: memory, persona
  and transcript are shared.

**Admin panel** (`/admin`)
- Moderation queue for user reports, character search with unpublish/delete,
  account management (suspend, change plan, grant or revoke admin), and an
  append-only audit log of every moderator action.
- Suspension revokes a live session on the next request, not at token expiry.

**Safety**
- A content policy module screens character definitions before they save, and
  appends non-negotiable rules *after* the character definition in every
  system prompt, so an author's text can't override them.
- Mature-themed characters require a stored date of birth showing the viewer
  is 18 or over — a checkbox alone does nothing.
- Crisis language in a message surfaces real helpline resources.
- A reporting endpoint feeds a moderation queue.

---

## Models

Two vendors, selected per model rather than globally — a Claude model routes to
Anthropic, a Gemini model to Google:

| Model | Vendor | Plan |
|---|---|---|
| Sonnet 5 | Anthropic | free |
| Haiku 4.5 | Anthropic | free |
| Gemini 2.5 Flash | Google | free |
| Gemini 2.5 Pro | Google | plus |
| Opus 5 | Anthropic | plus |

There are two ways to supply a key.

**In the app** (no file editing): sign in, open **Settings → Your model keys**,
and paste one. It is checked against the provider before being saved, stored
encrypted, and used for your chats in preference to anything the server has.
This is the easy path if you just want to run it on your own Gemini account.

**In `.env`** (instance-wide default, used by anyone without their own key):

```bash
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="..."          # aistudio.google.com/apikey — free tier available
```

Set either, both, or neither — a vendor with no key anywhere falls back to the
offline model, so mixing is fine.

How user-supplied keys are handled:

- Encrypted at rest with AES-256-GCM, keyed off `AUTH_SECRET`
  (`src/lib/crypto.ts`). Rotating `AUTH_SECRET` invalidates stored keys; users
  re-enter them, which is the right failure mode.
- Never returned to a browser — not even to the owner. Once saved a key can be
  replaced or removed, never read back. Only a masked preview (`AIza…cdef`) is
  shown. `scripts/security-check.sh` asserts this against the API, the settings
  HTML and `/api/me`.
- Validated with one real, tiny generation before storing, so a typo is caught
  immediately instead of failing mid-conversation.
- Provider errors are never echoed verbatim, since they can contain the
  submitted key.

**On Gemini and Google accounts:** a Gemini Advanced / Google One AI Premium
subscription is a consumer product and does **not** grant API access. There is
no OAuth scope that lets an app spend a subscription's inference. The API key
above is a separate thing, from Google AI Studio, and it is what this app
needs. Its free tier is enough to run everything here.

## Running without an API key

With `ANTHROPIC_API_KEY` empty, the app selects a built-in offline provider.
It is a text generator, not a language model — it reflects the character name
and your last line through a small set of roleplay beats — but it streams,
costs credits, supports regeneration and is fully deterministic, so every
feature in the product works and it doubles as a test fixture.

Set the key in `.env` and restart to switch to real generations:

```bash
ANTHROPIC_API_KEY="sk-ant-..."
```

`AI_PROVIDER` forces the choice explicitly (`anthropic` or `mock`).

---

## Architecture

```
src/
  app/
    api/              REST + SSE route handlers
    (pages)           Server Components; client islands only where needed
  components/         UI — Avatar, cards, ChatView, forms, primitives
  lib/
    ai/               Provider abstraction: types, anthropic, mock
    auth.ts           Sessions, viewer resolution, monthly credit refill
    safety.ts         Content policy: screening + prompt rules
    prompt.ts         Character definition -> system prompt
    chat-service.ts   Context assembly, memory folding, generation prep
    turns.ts          Pure: windowing, group turn-taking, trending score
    settings.ts       Pure: preference normalisation
    credits.ts        Quota accounting
  middleware.ts       Edge auth guard (real 307s on protected routes)
prisma/
  schema.prisma       Data model
  seed.ts             Demo account, tags, 10 original sample characters
tests/                Unit tests for the pure logic
```

A few decisions worth knowing about:

**Message variants, not a message tree.** Regenerating adds a row to
`MessageVariant` and moves `Message.activeVariant`. This models what the
product actually does — swiping between alternate replies to the same turn —
without the bookkeeping of a full branching tree.

**Safety rules go last.** `buildSystemPrompt` emits the character definition
first and the policy rules after it, including when an author supplies a
`systemPromptOverride`. Prompt order is doing real work here, and there's a
test that fails if it's reversed.

**Credits are reserved before generating.** `spendCredits` uses a conditional
`updateMany` with a `credits: { gte: cost }` guard, so two concurrent
generations can't both pass the balance check. Failed generations are
refunded.

**Pure logic is separated from server-only modules.** `turns.ts` and
`settings.ts` hold no database or `server-only` imports specifically so they
can be unit tested directly.

**Auth is guarded twice.** Middleware issues a real 307 before a protected
page starts rendering; the page then re-resolves the viewer itself. A Server
Component `redirect()` alone returns a 200 with a client-side hop, because
headers are already flushed during streaming SSR.

---

## Live mode notes

Voice uses the browser's own Web Speech API, so there is no key, no server cost
and nothing to install — but support is uneven, and the app reports this rather
than assuming:

| Browser | Her voice | Your mic |
|---|---|---|
| Chrome / Edge | yes | yes |
| Safari | yes | partial |
| Firefox | yes | no |

Where the mic is unavailable you can still type to her and she answers aloud.
Where speech synthesis is unavailable she falls back to captions. A device with
no installed voices degrades quietly to captions rather than showing an error.

The 3D character lives in `src/lib/avatar3d.ts` as a framework-free scene class
(`setMouthOpen`, `setEmotion`, `lookAt`), with a thin React wrapper in
`src/components/Avatar3D.tsx` that loads it via `next/dynamic` with `ssr:false`.
It honours `prefers-reduced-motion`, and falls back to a placeholder if WebGL
can't start. Her colouring derives from the character's accent colour.

## Admin panel and its security model

The panel lives at `/admin` and is gated on the `admin` role.

**Creating the first administrator** is deliberately impossible over HTTP —
this repository is public, so a web-reachable bootstrap would be a back door.
It requires shell access to the server:

```bash
npm run admin:grant -- you@example.com      # grant
npm run admin:grant -- you@example.com --revoke
```

Once one admin exists, they can promote others from the Users tab.

The controls, and why each is there:

- **Roles are never in the session token.** The JWT carries only a user id, so
  revoking admin takes effect on the next request rather than when a token
  expires. `requireAdmin()` re-reads the role from the database every call.
- **Non-admins get 404, not 403.** A 403 confirms the panel exists.
- **Every admin page gates itself**, not just the layout. App Router renders
  layouts and pages in parallel, so a layout-only check still lets the page run
  its queries and stream its markup. This was a real leak found in testing:
  admin page structure reached a non-admin's HTML payload. Each page now calls
  `requireAdmin()` before touching the database.
- **No privilege escalation path.** No endpoint accepts `role`, `credits` or
  `suspended` from a request body. `/api/me` validates against a schema that
  has no such fields and writes an explicit column allowlist.
- **Lockout protection.** An admin cannot suspend or demote themselves, and the
  last remaining active admin cannot be demoted.
- **Audit log.** Every action is appended with the actor, target and a
  server-generated description. Nothing in it comes from a request body.
- **Sessions use `SameSite=Lax`, `HttpOnly` cookies**, which blocks the
  cross-site POST vector for CSRF.

Verify all of it against a running instance:

```bash
npm run build && npm start &
npm run admin:grant -- demo@aitalk.local
BASE=http://localhost:3000 npm run security:check
```

That script asserts 21 access-control properties and exits non-zero on any
failure.

## Testing

```bash
npm test                                    # unit tests
npm run typecheck                           # tsc --noEmit
BASE=http://localhost:3000 npm run smoke    # browser crawl of every page
BASE=http://localhost:3000 npm run security:check
```

`npm run smoke` drives a real browser over every route signed out and signed
in, sends a chat message, and reports page errors, console errors, 5xx
responses, blank renders and horizontal overflow. `THEME=light` and `MOBILE=1`
cover the other viewports.

---

## Commands

| | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run setup` | Generate client + create database + seed |
| `npm run db:reset` | Drop and rebuild the database from scratch |
| `npm run db:seed` | Re-seed (idempotent) |
| `npm run admin:grant -- <email>` | Grant the admin role (add `--revoke` to remove) |
| `npm run smoke` | Browser crawl of every page (needs a running server) |
| `npm run security:check` | Access-control assertions (needs a running server) |

## Configuration

Every value has a working default except the API key. See `.env.example`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string. SQLite by default. |
| `AUTH_SECRET` | Session signing key. **Must** be changed before deploying. |
| `ANTHROPIC_API_KEY` | Enables real generations. Empty means offline model. |
| `AI_PROVIDER` | Force `anthropic` or `mock`. Auto-selects when unset. |
| `DEFAULT_MODEL` | Model id for new chats. |
| `CREDITS_FREE` / `_PLUS` / `_PRO` | Monthly credit grants per tier. |
| `ALLOW_SIGNUPS` | Set `false` for an invite-only instance. |

## Deploying

Three things need changing for anything public:

1. **`AUTH_SECRET`** — generate with `openssl rand -base64 48`.
2. **Delete or rename the seeded demo account.** `demo@aitalk.local` ships with
   the password `demo1234`, documented in this README and in the seed script.
   It is created as an ordinary user and is never an admin by default, but on a
   public instance it is a known credential — remove it, or don't run the seed:

   ```bash
   npm run setup   # includes the demo account and sample characters
   # or, for a clean instance:
   npx prisma db push   # schema only, no seed data
   ```

3. **Avatar uploads** write to `public/uploads` on local disk. On ephemeral or
   multi-instance hosting, swap `src/app/api/upload/route.ts` for object
   storage. Its contract (multipart in, `{ url }` out) is all the client
   depends on.

SQLite is fine for a single instance. For anything larger, point
`DATABASE_URL` at Postgres and change the `provider` in `prisma/schema.prisma`.

**There is no payment processor.** Plan switching grants credits immediately
so the quota system is exercisable. `src/app/api/me/plan/route.ts` is where a
real billing integration would go.

## Notes

The ten sample characters in `prisma/seed.ts` are original creations written
for this project.

The safety module is a first line of defence, not a complete moderation stack:
it screens definitions on write and constrains every prompt, and the model
provider enforces its own policy on top. A production deployment should add
output-side moderation and staff the report queue.
