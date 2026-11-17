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

The tarot knowledge base and spread catalog ship as versioned TypeScript modules (`lib/tarot/data`, `lib/tarot/spreads.ts`); admins edit their text through audited overrides in `arcana_kb_overrides` (section 6c). The effective version is stamped on every reading.

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

### Admin API (all return 404 to non-admins)

| Method | Endpoint | Body | Notes |
| --- | --- | --- | --- |
| POST / DELETE | `/api/admin/session` | `{ key }` | operator-key sign-in / sign-out |
| POST | `/api/admin/settings` | `{ key, value }` | validated against `settingsSchemas` |
| POST | `/api/admin/admins` | `{ emails }` | owner only |
| POST | `/api/admin/users/credits` | `{ ref, amount, note }` | negative amount = correction |
| POST | `/api/admin/users/tier` | `{ ref, tier, periodEnd }` | manual subscription |
| POST | `/api/admin/ai-probe` | `{ models }` | admin session or server secret |

## 6b. Admin, settings, credits (M6)

Migration: `supabase/migrations/0002_arcana_admin_credits.sql`.

**RBAC.** `arcana_admin_role()` returns `owner`, `admin` or null. It is evaluated in SQL on every request from either the verified JWT email (`owner_emails` / `admin_emails` in `arcana_server_config`) or the operator key (`x-arcana-admin` header from an httpOnly, SameSite=Strict cookie; only its SHA-256 is stored). Owners alone can change the admin list. Every admin function calls `arcana_require_admin()` / `arcana_require_owner()` itself, so the API layer is not the security boundary. Admin screens never see guest tokens — users are identified by `arcana_user_ref()` (`u:<uid>` or `g#<hash>`).

**Tables** (RLS on, no policies — reachable only through SECURITY DEFINER functions):

| Table | Purpose |
| --- | --- |
| `arcana_settings` | runtime configuration (key → jsonb) |
| `arcana_audit_logs` | who changed what (settings, credits, tiers, admin list, key logins) |
| `arcana_error_logs` | AI failures, quality failures, failed admin logins |
| `arcana_credit_transactions` | append-only ledger; balance = sum(amount); unique `(user_key, idempotency_key)` |
| `arcana_subscriptions` | tier per user (free / basic / premium / unlimited), set manually for now |

**Runtime settings** (`lib/settings.ts`, 30 s cache per instance, invalid rows fall back to defaults): `reversal_probability`, `limits`, `credits`, `disabled_spreads`, `models`, `prompt_addendum`, `model_prices`, `packages`. The prompt addendum is appended below the core persona and is explicitly subordinate to it; its hash is part of the prompt version stored on each analysis.

**Credits** (off by default). When enabled, interpretation costs credits by spread size (≤3 / 4–7 / ≥8 cards) instead of the daily reading quota; follow-ups and clarifier cards have their own prices.

1. `arcana_wallet()` applies the once-per-day top-up (balance raised to the tier's allowance; credits above it are kept) under a per-user advisory lock.
2. The route checks the balance **before** calling the AI — an unaffordable request costs nothing and makes no AI call (HTTP 402).
3. `arcana_spend_credits()` runs **after** the result is saved: atomic, never below zero, idempotent on `interpret:<reading id>` / `chat:<uuid>`. A failed or quality-rejected AI call is never charged.

**Cost monitoring.** `arcana_ai_usage` records provider, model and tokens per call; Admin → Overview multiplies by the editable `model_prices` table. It is an estimate, not an invoice. No payment gateway is integrated, so revenue and margin are not shown.

## 6c. Admin-editable knowledge base

Migration: `supabase/migrations/0003_arcana_kb_overrides.sql`. UI: Admin → คลังความรู้ไพ่ (`/admin/knowledge`). API: `POST /api/admin/knowledge` `{ type: "card" | "spread", id, fields }` or `{ type, id, reset: true }`.

The canonical knowledge base still ships in code (`lib/tarot/data`, `lib/tarot/spreads.ts`). `arcana_kb_overrides` stores, per card or spread, **only the text fields that differ** from the shipped default.

| | Editable (text) | Fixed (structure) |
| --- | --- | --- |
| Card | Thai name, upright / reversed keywords, upright, reversed, love, career, finance, advice | id, English name, arcana, suit, number, element, image |
| Spread | Thai name, description, interpretation strategy, each position's name and meaning | id, English name, card count, position keys and order, category |

- `lib/tarot/overrides.ts` — strict Zod schemas (an override carrying a structural key is rejected whole), `applyCardOverride` / `applySpreadOverride` (invalid rows are ignored, the default wins), `diffCard` / `diffSpread` (saving a value equal to the default removes the override).
- `lib/tarot/knowledge.ts` — `getKnowledge(supabase)` returns the **effective** knowledge base (30 s cache per instance). Card pages, the reading table, the spread picker, question analysis, the interpretation prompt and follow-up chat all read from it; nothing user-facing or AI-facing reads the static deck directly for text. Structure-only code (`draw.ts`, `analysis.ts`) keeps using the static deck.
- **Versioning.** `Knowledge.version` is the shipped version when nothing is overridden, otherwise `rws-th-x.y.z+kb-<hash of all overrides>`. It is stored on every reading and analysis, so each saved interpretation records exactly which knowledge it was grounded in. Old interpretations are never rewritten when the knowledge changes.
- **History.** Every save and reset writes `arcana_audit_logs` with the old and new fields; `revision` on the override row counts edits.

Custom spreads (new ids / new card counts) and additional decks are not part of this — they change structure and belong to a later phase.

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
| M6 | Admin dashboard (owner/admin RBAC), runtime settings, model + prompt-addendum management, usage and cost analytics, credit ledger, manual subscription tiers, audit + error logs | ✅ shipped |
| M6+ | Card meanings and spread texts editable in Admin as audited, resettable overrides with version stamping | ✅ shipped |
| M6++ | Custom spreads / additional decks (structural changes); full prompt versions with rollback | next |
| M7 | E2E tests (Playwright), 200-question evaluation set with human rubric (25/20/15/15/10/10/5), cost tuning per model tier | next |
| Later | Payment gateway, custom spreads, share cards, voice, astrology / numerology / BaZi as separate disciplines | planned |

## 9. Known constraints of the current deployment

- The schema currently lives inside a shared Supabase project (free-tier project limit). Moving to a dedicated project = run the migration there, insert the secret hash, change two env vars.
- Because the Supabase project is shared, its Auth redirect URLs belong to another app: email confirmation works, but the link lands on that app's site — users then return and sign in. A dedicated project (or adding this domain to the redirect allow-list) removes that wart. Guest mode is unaffected.
- AI quality has unit-level guards and structural validation, but the human-reviewed evaluation set is not built yet.
- **AI provider:** with `ANTHROPIC_API_KEY` set the adapter calls Anthropic directly (Claude Sonnet for interpretation and chat, Haiku for question analysis). Without it, it uses the Vercel AI Gateway — whose free tier does not include Claude — and falls through its candidate list to interim models (`openai/gpt-5`, `openai/gpt-4.1`, `openai/gpt-4.1-mini`). The provider and model actually used are recorded on each analysis row and in `arcana_ai_usage`, and shown in Admin → Overview.
- `POST /api/admin/ai-probe` reports which gateway models the deployment can reach (also available as a button in Admin → Settings).
- Runtime settings are cached for 30 seconds per server instance, so an admin change can take that long to reach every instance.
