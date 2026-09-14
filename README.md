# AI Talk

An AI character chat and roleplay platform. Write characters, give them a
voice and a past, and hold a conversation that remembers. Built with Next.js,
Prisma and the Anthropic API — and it runs end to end with no API key at all,
on a built-in offline model, so you can click through everything before
spending a cent.

```bash
npm install
cp .env.example .env
npm run setup      # generate client, create the database, seed sample data
npm run dev        # http://localhost:3000
```

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

**Safety**
- A content policy module screens character definitions before they save, and
  appends non-negotiable rules *after* the character definition in every
  system prompt, so an author's text can't override them.
- Mature-themed characters require a stored date of birth showing the viewer
  is 18 or over — a checkbox alone does nothing.
- Crisis language in a message surfaces real helpline resources.
- A reporting endpoint feeds a moderation queue.

---

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

Two things need changing for anything public:

1. **`AUTH_SECRET`** — generate with `openssl rand -base64 48`.
2. **Avatar uploads** write to `public/uploads` on local disk. On ephemeral or
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
