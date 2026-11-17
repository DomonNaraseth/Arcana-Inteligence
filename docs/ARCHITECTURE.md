# ARCANA INTELLIGENCE — Architecture

Version 1.0 · covers system architecture, database, API contracts, AI engine, security, environment and roadmap.

## 1. System overview

Modular monolith on Next.js (App Router), deployed to Vercel, data in Supabase PostgreSQL.

```
Browser (React, Framer Motion)
   │  fetch
   ▼
Next.js route handlers / server components
   ├─ lib/tarot   Knowledge Engine · Spread Engine · Random Engine · Spread statistics
   ├─ lib/ai      Question Engine · Interpretation · Synthesis · Conversation · Quality Control
   ├─ lib/data    Reading persistence · usage log · quotas
   └─ lib/supabase request context (owner key + server credential)
        │                         │
        ▼                         ▼
   Supabase PostgreSQL       AI provider adapter
   (RLS on every table)      Anthropic API  ·or·  Vercel AI Gateway
```

Core principle: **the AI interprets, it does not own.** Randomization, the knowledge base, spread positions and structural statistics are deterministic, auditable code. The model receives them as validated JSON.

## 2. Question-to-answer pipeline

| # | Step | Where |
| --- | --- | --- |
| 1 | User submits a question | `components/reading/AskFlow.tsx` |
| 2 | Intent classification, ambiguity check, spread recommendation | `POST /api/questions/analyze` → `analyzeQuestion()` (fast model, heuristic fallback) |
| 3 | User confirms understanding, may answer one clarification, may override the spread | AskFlow |
| 4 | Reading created + cards drawn (CSPRNG, idempotent) | `POST /api/readings` → `drawForSpread()` |
| 5 | Card reveal, one by one or skip | `ReadingExperience` + `TarotCardView` |
| 6 | Interpretation (10 layers) → 12-section JSON | `POST /api/readings/:id/interpret` → `interpretReading()` |
| 7 | Quality validation, bounded retry (max 2 attempts) | `verifyInterpretation()` |
| 8 | Follow-up conversation / clarifier cards | `POST /api/readings/:id/chat` → `answerFollowUp()` |

## 3. AI engine

### Provider adapter (`lib/ai/provider.ts`)

`generate({ system, messages, maxTokens, tier })` — `tier: "deep"` for interpretation and follow-up, `"fast"` for question analysis. Resolution order: `ANTHROPIC_API_KEY` → Vercel AI Gateway (`AI_GATEWAY_API_KEY` or the deployment OIDC token) → `AiNotConfiguredError`. Swapping models or vendors is an environment change only.

### Layered prompts (`lib/ai/prompts.ts`)

| Layer | Content |
| --- | --- |
| L1 | Core persona & hard rules (`CORE_PERSONA`) — professional, direct, no fear, no guarantees |
| L2 | Card knowledge for the drawn cards only, as structured JSON from the KB (orientation-specific meaning, keywords, domain meanings) |
| L3 | Question context: original question + validated analysis |
| L4 | Spread & position context + per-spread interpretation strategy |
| L5 | Ten-layer analysis method; element/suit/major/reversal counts are **computed in code** (`lib/tarot/analysis.ts`) and passed in |
| L6 | Output contract (JSON) + self quality checklist |

User text is always passed as data inside the payload, with an explicit instruction that it is not a command (prompt-injection hardening).

### Quality control

1. Zod schema validation of the full interpretation.
2. Code-level check: every drawn position present, `card_id` matches the draw, no extra cards.
3. Model self-report (`quality_check`) for: question answered, all cards used, positions respected, contradictions addressed, no over-claiming.
4. On failure the issues are fed back and the model revises once. If card integrity still fails → `quality_failed` (nothing is shown or charged). If only soft self-reported issues remain → delivered with a visible notice.

Every saved analysis records provider, model, `PROMPT_VERSION`, `KNOWLEDGE_BASE_VERSION`, token usage and the quality report.

### Follow-up conversation

Context = original question, analysis, spread, original cards, clarifier cards (flagged separately), summary of the saved interpretation, last 12 messages. Rules: never change cards, never flip conclusions because the user re-asks, label clarifier cards as additions, suggest a new reading for unrelated questions. Max 3 clarifier cards per reading; the user presses the button — the AI cannot draw.

## 4. Database (Supabase PostgreSQL)

Migration: `supabase/migrations/0001_arcana_init.sql`. All objects are prefixed `arcana_`.

```
arcana_readings 1──* arcana_reading_cards      (insert-only)
       │        1──* arcana_reading_analyses   (insert-only, versioned)
       │        1──* arcana_messages           (insert-only)
       │        0──* arcana_journals           (reading_id nullable, ON DELETE SET NULL)
arcana_ai_usage        (per call: feature, provider, model, tokens)
arcana_server_config   (server secret hash; no API access)
```

| Table | Purpose | Notes |
| --- | --- | --- |
| `arcana_readings` | question, analysis JSON, spread, status, title, tendency, draw metadata, KB version, idempotency key | trigger blocks changes to question / spread / draw_meta / owner |
| `arcana_reading_cards` | position, position key, card id, orientation, `is_followup` | unique (reading, position) and (reading, card); no UPDATE/DELETE policy |
| `arcana_reading_analyses` | interpretation JSON, quality report, provider/model/prompt/KB versions, tokens | |
| `arcana_messages` | follow-up conversation (`kind`: chat / draw) | |
| `arcana_journals` | personal notes, optional link to a reading, mood | |
| `arcana_ai_usage` | cost monitoring + daily quotas | |

The tarot knowledge base and spread catalog are versioned TypeScript modules (`lib/tarot/data`, `lib/tarot/spreads.ts`) rather than tables in this version — they change with code review, and their version is stamped on every reading. Moving them into `tarot_cards` / `spreads` tables is part of the Admin phase.

## 5. Security

- **RLS on every table.** Policies require both:
  1. `arcana_is_server()` — the request carries the `x-arcana-server` secret whose SHA-256 matches `arcana_server_config`. The public anon key alone can read and write nothing.
  2. `user_key = arcana_user_key()` — `u:<auth uid>` from the verified JWT, or `g:<64 hex>` from the guest header. The prefixes make it impossible for a guest header to impersonate an account.
- Guest token: 256-bit, generated in middleware, `httpOnly` + `SameSite=Lax` + `Secure` cookie. It never reaches client JavaScript.
- Signing in calls `arcana_claim_guest()` to move the browser's guest data into the account.
- AI keys and the server secret exist only in server environment variables.
- All request bodies validated with Zod; ids validated before querying; owner is never taken from the client.
- Idempotency key on reading creation; interpretation is idempotent (an interpreted reading is returned, never regenerated).
- Fair-use quotas per session per 24h (`ARCANA_DAILY_*`).

## 6. API contracts

All errors: `{ "error": { "code", "message" } }` with codes `bad_request`, `not_found`, `config_missing`, `ai_not_configured`, `ai_unavailable`, `quality_failed`, `quota_exceeded`, `server_error`.

| Method | Endpoint | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/questions/analyze` | `{ question }` | `{ analysis }` |
| POST | `/api/readings` | `{ question, spreadId, analysis, idempotencyKey }` | `{ id }` |
| POST | `/api/readings/:id/interpret` | – | `{ interpretation, quality }` |
| POST | `/api/readings/:id/chat` | `{ message, drawCard? }` | `{ reply, newCard }` |
| DELETE | `/api/readings/:id` | – | `{ ok }` |
| POST | `/api/journals` | `{ title, content, mood?, readingId? }` | `{ journal }` |
| DELETE | `/api/journals/:id` | – | `{ ok }` |
| POST | `/api/auth/claim` | – | `{ claimed }` |

## 7. Folder structure

```
app/
  page.tsx                 landing
  (app)/                   home, ask, reading/[id], history, journal, cards, account
  api/                     route handlers
  auth/callback            email confirmation landing
components/                brand, shell, tarot, reading, journal, account
lib/                       tarot, ai, data, supabase, api.ts, format.ts
supabase/migrations/       SQL
scripts/fetch-cards.mjs    public-domain card artwork downloader
tests/unit/                vitest
docs/
```

## 8. Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| M0–M5 | Architecture, foundation, tarot core, AI intelligence, reading experience, follow-up, history, journal | ✅ shipped |
| M6 | Admin dashboard (RBAC), prompt/model management in DB, KB + spreads in tables, analytics, credits/subscription framework | next |
| M7 | E2E tests (Playwright), 200-question evaluation set with human rubric (25/20/15/15/10/10/5), cost tuning per model tier | next |
| Later | Payment gateway, custom spreads, share cards, voice, astrology / numerology / BaZi as separate disciplines | planned |

## 9. Known constraints of the current deployment

- The schema currently lives inside a shared Supabase project (free-tier project limit). Moving to a dedicated project = run the migration there, insert the secret hash, change two env vars.
- Because the Supabase project is shared, its Auth redirect URLs belong to another app: email confirmation works, but the link lands on that app's site — users then return and sign in. A dedicated project (or adding this domain to the redirect allow-list) removes that wart. Guest mode is unaffected.
- AI quality has unit-level guards and structural validation, but the human-reviewed evaluation set is not built yet.
