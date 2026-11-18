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

## 6d. Payments (credit purchases)

Migration: `supabase/migrations/0004_arcana_payments.sql`. Code: `lib/billing/` (`provider.ts` adapter interface, `stripe.ts` implementation over plain HTTPS, `service.ts` fulfilment). No card data touches this application — the user pays on Stripe's hosted Checkout page; payment methods are whatever is enabled in the Stripe dashboard.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/billing/checkout` `{ packageId }` | records a `pending` payment (price and credits from server settings), creates the hosted checkout, binds the session id to the payment, returns the URL |
| `POST /api/billing/confirm` `{ paymentId }` | on return from checkout: asks the provider for the real session state and fulfils if paid (owner only) |
| `POST /api/billing/webhook` | provider → server. Verifies `Stripe-Signature` (HMAC-SHA256 over `t.rawBody`, constant-time compare, 5-minute tolerance) |

**Integrity rules**

1. The browser never decides anything: not the price, not the credit amount, not whether a payment succeeded.
2. Credits are granted only by `arcana_fulfill_payment()`, which requires the payment's own session id and re-checks **amount and currency** against what was recorded at checkout. A mismatch grants nothing and is logged (`payment_amount_mismatch`).
3. Fulfilment is idempotent: the ledger row uses the key `payment:<id>`, so the webhook and the return-page confirmation can both run, in any order, any number of times.
4. A late success after `expired` / `failed` is still honoured — the money arrived.
5. Webhook failures on our side return 500 so the provider retries; forged or unparsable requests return 400.
6. Test-mode payments (`livemode = false`) are shown but never counted as revenue.

Tables: `arcana_payments` (intent → outcome), `arcana_payment_events` (received webhook events, audit only). Both have RLS on and no policies. Guests may buy unless `billing.require_account` is set; `arcana_claim_guest()` moves a guest's credits, payments and tier into the account on sign-in.

Not implemented: partial refunds and refunds of membership charges (refund in Stripe, then correct credits in Admin → Users), plan switching in place, tax (see 6e). With no `STRIPE_SECRET_KEY` the checkout endpoints return `billing_not_configured` and the UI says purchases are not available.

`scripts/dev-mock-billing.mjs` runs the app against an in-memory stand-in for the Stripe API (dev only — `STRIPE_API_BASE` is ignored in production).

Stripe conventions the adapter follows: every request carries a pinned `Stripe-Version` (`STRIPE_API_VERSION` in `lib/billing/stripe.ts`); `payment_method_types` is never sent (methods come from the dashboard); the session's `expires_at` is fixed by the caller so a retry under the same idempotency key sends identical parameters; a restricted key (`rk_…`, Checkout Sessions: Write) is preferred over a secret key.

Testing against a real Stripe sandbox, with no API key in the project — both tools relay API calls through the Stripe CLI's own login and refuse to run unless it is in test mode:

- `node scripts/dev-stripe-sandbox.mjs` — the app on :3002 with real hosted checkout and real webhooks (`stripe listen`). Needs the credit system switched on.
- `STRIPE_SANDBOX=1 npx vitest run tests/integration` — the adapter alone (create, idempotent retry, unknown session, real signed webhook); touches no application database. With `STRIPE_SANDBOX_PAY_FILE=<path>` it waits for the checkout to be paid with a test card and checks that session and its webhook.

## 6e. Daily card, memberships and the revenue model

Migration: `supabase/migrations/0006_arcana_daily_subscriptions.sql`.

### The model (all numbers are runtime settings — Admin → Settings)

| Layer | What the user gets | Default |
| --- | --- | --- |
| Free | Daily card + shared message of the day, every day; card library, history, journal | no recurring free credits (`credits.daily_free.free = 0`) |
| Free account | one-time sign-up bonus; a streak reward every N consecutive daily cards | `credits.signup_bonus = 6`, `daily.streak_days = 7`, `daily.streak_reward = 3` |
| Membership (monthly) | credits granted at every paid invoice, more free follow-ups per reading | `plans`: Plus ฿149 → 60 credits, Premium ฿299 → 150 credits |
| Top-up packs | one-time credits | `packages`: ฿99 → 30, ฿199 → 70, ฿399 → 150 |

Why it is shaped this way: a full reading on the deep model costs roughly ฿3–4.5 in AI tokens (measured from `arcana_ai_usage`: about 8.4k input and 8.2k output tokens), so recurring free readings lose money at volume. The free habit is therefore the daily card, whose AI message is generated at most once per card and orientation per day with the fast model and shared by everyone. Readings cost 2 / 3 / 4 credits by spread size, so a credit costs about ฿1.2–1.5 to serve and sells for ฿2–3.3. Guests get no trial credits by default (`credits.guest_trial = 0`): a trial bound to a browser cookie can be repeated with a fresh browser profile, a sign-up bonus cannot.

### Daily card

- `POST /api/daily` draws with `drawDailyCard()` (node:crypto) and stores the card through `arcana_daily_draw()` — one row per user per Bangkok day, insert-only, so a second call returns the same card. The AI never sees a choice to make.
- The message of the day (`lib/ai/daily.ts`) is validated in code (Zod shape, and it may name no card other than the one drawn) before `arcana_daily_message_put()` stores it; the first writer wins. If the AI is not configured or the output is rejected, the page shows the knowledge-base meaning — never invented text.
- Streak: `arcana_daily_streak()`; every completed cycle grants bonus credits to signed-in accounts once (`streak:<day>` idempotency key), only while credits are enabled.

### Memberships

- A membership is a recurring credit purchase that also sets the tier. `POST /api/billing/subscribe` requires a signed-in account, records a `kind = 'subscription'` row in `arcana_payments` and opens a Checkout Session in `subscription` mode (one Stripe Product per plan, `arcana_plan_<tier>`).
- First payment: `checkout.session.completed` → `arcana_fulfill_payment()` (credits) → `arcana_activate_subscription()` (tier; subscription state read from Stripe server-side).
- Renewals: `invoice.paid` → `arcana_renew_subscription()` — one paid row and one credit grant per invoice id. The plan is resolved from the subscription id stored in the database, not from event metadata; the credits come from the current `plans` setting.
- Changes: `customer.subscription.updated|deleted` → `arcana_sync_subscription()`. Access runs to the end of the paid period plus two days of grace; a failed renewal is not extended, so it lapses on its own.
- Self-service: `POST /api/billing/portal` opens Stripe's Customer Portal (cancel at period end, card, invoices). The customer id is looked up server-side.
- Refunds: `charge.refunded` (full) and `charge.dispute.created` → `arcana_refund_payment()` marks a credit-pack payment refunded and takes back the unspent part of its credits, never below zero.
- Precedence: a provider event overwrites a manual tier; `arcana_admin_set_tier()` overwrites a provider-managed one until the next provider event.

Webhook events to select in Stripe: the four `checkout.session.*` events plus `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`. A restricted key needs write access to Checkout Sessions, Products and Customer portal, and read access to Subscriptions.

### Tax — a decision for the owner, deliberately not automated

`automatic_tax` is off. Before switching it on: decide whether listed prices include VAT, and add the business's tax registration in Stripe (Tax → Locations). Without an active registration Stripe collects no tax and reports no error, so turning the flag on alone changes nothing.

### Verified against a real Stripe sandbox

`tests/integration/stripe-membership.test.ts` (opt-in) drives a real subscription checkout, the first credit grant, the billing portal, a renewal invoice, a scheduled cancellation and the end of the subscription through the same service code as the webhook route, using a throwaway guest. Not covered by it: the HTTP routes themselves (they need the credit system on) and refunds.

## 6f. PromptPay — how real money is taken

Migration: `supabase/migrations/0007_arcana_promptpay.sql`. Code: `lib/billing/promptpay.ts` (QR payload, config), `lib/billing/slip.ts` (slip verification adapter and our own checks), routes under `app/api/billing/promptpay/`, page `app/(app)/pay/[id]`.

**Why not Stripe:** Stripe's restricted-businesses list prohibits "บริการเกี่ยวกับเรื่องเหนือธรรมชาติและการดูดวง" for accounts in Thailand, so the Stripe integration (6d, 6e) stays a sandbox-only tool. On production a test-mode key is offered to admins only.

**Flow**

1. `POST /api/billing/promptpay` with `{ packageId }` or `{ planId }` records a `provider = 'promptpay'` payment at the server-side price and returns `/pay/<id>`.
2. The payment page shows a PromptPay QR carrying the exact amount (payload from `promptpay-qr`, image from `qrcode`, both rendered on the server), the recipient's account name and a masked id.
3. The customer transfers in their banking app, then either
   - uploads the slip → `POST /api/billing/promptpay/slip` sends the image to the slip-verification service (SlipOK when `SLIPOK_BRANCH_ID` and `SLIPOK_API_KEY` are set), which confirms the transfer with the banking network; `checkSlip()` then requires the same amount, a transfer time not older than the payment (10 minutes of slack) and the optional recipient hint; `arcana_fulfill_promptpay()` re-checks owner, amount and time and grants; or
   - presses "แจ้งโอนแล้ว" → `arcana_claim_promptpay()` stores a note. This grants nothing: an admin compares it with the bank statement in Admin → Payments and approves (`arcana_admin_approve_promptpay()`) or rejects.
4. Both paths end in `arcana_promptpay_grant()`: status `paid`, credits through the ledger once, and for a plan a prepaid membership. A unique index on the transfer reference makes one slip pay for one payment only. The slip image is never stored.

**Prepaid memberships:** a plan bought by PromptPay lasts 30 days from payment (`source = 'prepaid'`), grants the plan's credits at once and never renews or charges by itself; buying the same plan again while active adds 30 days.

**What each party must set up:** the PromptPay id, account name and seller contact are runtime settings (`promptpay`, `business`), entered in Admin → Settings. The slip service keys are environment variables. Without the slip service every transfer waits for manual approval.

**Owner notifications** (`lib/notify.ts`): when a customer reports a transfer, and when a slip is confirmed automatically, a short notice goes to every configured channel — LINE Messaging API push (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ADMIN_USER_ID`) and/or Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). It carries the amount, the package and a link to Admin → Payments, never customer details, and a failed notice never fails the customer's request. Admin → Payments has a test button.

**Not automated:** refunds (transfer back from the banking app, then correct credits in Admin → Users), renewal reminders, expiry of unpaid PromptPay payments.

`node scripts/dev-promptpay.mjs` runs the app on :3003 with a made-up PromptPay id; payments created by a development build are flagged as test.

**Policies:** `/terms` holds the terms, the refund and cancellation policy, the privacy notice and the seller's contact details (from the `business` setting). The text is a starting template and should be reviewed by the owner.

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
| Payments | Stripe Checkout credit purchases, signed webhooks, idempotent fulfilment, admin payments + revenue | ✅ code shipped — inactive until Stripe keys are configured |
| M6++ | Custom spreads / additional decks (structural changes); full prompt versions with rollback; automatic refunds | next |
| M7 | E2E tests (Playwright), 200-question evaluation set with human rubric (25/20/15/15/10/10/5), cost tuning per model tier | next |
| Later | Payment gateway, custom spreads, share cards, voice, astrology / numerology / BaZi as separate disciplines | planned |

## 9. Known constraints of the current deployment

- The schema currently lives inside a shared Supabase project (free-tier project limit). Moving to a dedicated project = run the migration there, insert the secret hash, change two env vars.
- Because the Supabase project is shared, its Auth redirect allow-list belongs to another app. **Google sign-in and email-confirmation links return to this app only after `https://<app domain>/**` is added to Authentication → URL Configuration → Redirect URLs**; until then they land on the other app's Site URL. Adding it is additive and does not affect the other app. Guest mode and email+password sign-in for already-confirmed accounts are unaffected.
- Sign-in (`components/account/GoogleSignInButton.tsx` → `/auth/callback`) uses PKCE; the callback accepts only same-site relative `next` paths and calls `arcana_claim_guest()` so a guest's readings, journal, credits, payments and tier move into the account.
- Saved readings: `arcana_readings.saved_at` (migration `0005`) is a bookmark set through `POST /api/readings/:id/save`; history has a "saved" filter. "Save as PDF" is the browser print dialog with a print stylesheet — no server-side rendering.
- AI quality has unit-level guards and structural validation, but the human-reviewed evaluation set is not built yet.
- **AI provider:** with `ANTHROPIC_API_KEY` set the adapter calls Anthropic directly (Claude Sonnet for interpretation and chat, Haiku for question analysis). Without it, it uses the Vercel AI Gateway — whose free tier does not include Claude — and falls through its candidate list to interim models (`openai/gpt-5`, `openai/gpt-4.1`, `openai/gpt-4.1-mini`). The provider and model actually used are recorded on each analysis row and in `arcana_ai_usage`, and shown in Admin → Overview.
- `POST /api/admin/ai-probe` reports which gateway models the deployment can reach (also available as a button in Admin → Settings).
- Runtime settings are cached for 30 seconds per server instance, so an admin change can take that long to reach every instance.
