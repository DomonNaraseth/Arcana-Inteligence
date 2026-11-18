# ARCANA INTELLIGENCE — project rules

AI Tarot & Life Guidance platform. Thai-first UI. Read `docs/ARCHITECTURE.md` before changing structure.

## Non-negotiable product rules

1. **The AI never chooses or alters cards.** Cards come only from `lib/tarot/draw.ts` (node:crypto). The AI receives drawn cards and interprets them.
2. **No fake readings.** If the AI provider is not configured or fails, show the Configuration Missing / error state. Never render mock interpretation text.
3. **Drawn cards are immutable.** `arcana_reading_cards` has no UPDATE/DELETE policy. Follow-up draws append `is_followup` rows; they never replace the original spread.
4. **Every interpretation passes `verifyInterpretation`** (card ids and positions checked in code) before it is saved. Usage is logged only after a successful save — failed AI calls are never counted against the user.
5. **Direct answer first.** The reading output always leads with `direct_answer`.
6. **Responsible guidance.** No guaranteed outcomes, no death/illness/disaster predictions, no medical/legal/investment directives, no claims about third parties' private thoughts, no fear-based retention. These live in `CORE_PERSONA` (`lib/ai/prompts.ts`) — do not weaken them.

7. **Credits are charged after success, once.** Check the balance before the AI call, call `spendCredits` only after the result is saved, always with a stable idempotency key. Never charge for a failed or quality-rejected request.
8. **Admin authority lives in SQL.** Every admin function calls `arcana_require_admin()` / `arcana_require_owner()`; API routes use `adminRoute()` and return 404 to non-admins. Admin screens identify users by `arcana_user_ref()` — never expose a guest token. Every admin mutation writes `arcana_audit_logs`.

9. **Read card and spread text from the effective knowledge base.** Anything shown to a user or sent to the AI uses `getKnowledge()` / `currentKnowledge()` (shipped defaults + admin overrides) and stores `kb.version`. Only structural code (`draw.ts`, `analysis.ts`) may read the static deck. Overrides may change text only — never ids, arcana, suit, element, card counts or position keys.

10. **Payments: the browser decides nothing.** Price and credit amount come from server settings; success is established only by the provider (signed webhook or a server-side session lookup) and credits are granted only through `arcana_fulfill_payment()` (re-checks session id, amount and currency) and, for membership renewals, `arcana_renew_subscription()` (once per invoice id); both are idempotent. A membership tier changes only through `arcana_activate_subscription()` / `arcana_sync_subscription()` from provider-verified events, or `arcana_admin_set_tier()`. For PromptPay, success is established only by: the payment gateway that issued the order's QR or card checkout link (Beam: an HMAC-signed webhook followed by our own server-side charge/link lookup, or that lookup alone — then `arcana_fulfill_gateway()` re-checks reference, amount and currency); the slip-verification service's answer (server side, then re-checked for owner, amount and time); or an admin's audited approval. Everything is granted through `arcana_promptpay_grant()` — one transfer or charge reference pays for one payment. Gateway test (playground) keys serve admins only and never count as revenue. Never grant purchase credits or a paid tier any other way, and never fake a provider when keys are missing. A test-mode card key on production is open to admins only (`cardCheckoutOpen`): test cards cost nothing.

    **Stripe live mode is not an option for this product on a Thai account**: Stripe's restricted-businesses list prohibits fortune-telling services in Thailand. Real payments go through PromptPay; do not switch production to live Stripe keys.

11. **The daily card is drawn once and never redrawn.** `drawDailyCard()` picks it, `arcana_daily_draw()` stores it insert-only per user per Bangkok day. Its message of the day is shared per card per day, must pass `verifyDailyMessage` before it is stored, and falls back to the knowledge-base meaning — never to invented text.

12. **Free does not mean free AI.** Recurring free allowances must not include deep-model readings by default; the free habit is the daily card. Check the cost per reading (Admin → overview) before raising any free allowance.

13. **Measurement is first-party and coarse.** Page views and touchpoints go through `arcana_track()` only; never store a full URL, IP address, user agent or anything typed by the user, and do not add third-party pixels or analytics scripts without the owner's decision on consent (PDPA).

## Architecture conventions

- Modular monolith. Business logic lives in `lib/` and never imports from `components/` or `app/`.
  - `lib/tarot/` — knowledge base (78 cards), spreads, randomization, deterministic spread statistics
  - `lib/ai/` — provider adapter, layered prompts (L1–L6), Zod schemas, engine (analyze / interpret / follow-up), heuristic fallback
  - `lib/data/` — Supabase data access, usage logging, quotas
  - `lib/supabase/` — request context (`getContext()`), browser auth client
  - `lib/settings.ts` — runtime settings (Zod-validated, defaults on any invalid row); `lib/credits.ts` — wallet + spend; `lib/admin.ts` — role resolution, `requireAdminPage`, `adminRoute`
- Operational knobs (limits, reversal probability, credit prices, enabled spreads, models, prompt addendum) are runtime settings edited in `/admin/settings`, not environment variables. Add a new one by extending `settingsSchemas` + `DEFAULT_SETTINGS` and the key allow-list in `arcana_admin_set_setting`.
- All database access goes through `getContext()` on the server. The browser Supabase client is used for auth only.
- Ownership key: `u:<auth uid>` or `g:<guest token>` (see `arcana_user_key()` in the migration). Never trust a client-supplied owner.
- All tables are prefixed `arcana_` (the schema may live in a shared Supabase project).
- Validate every request body with Zod. Return errors through `lib/api.ts` (`fail` / `handleError`) with Thai user-facing messages.
- Bump `PROMPT_VERSION` (`lib/ai/schemas.ts`) when prompts change and `KNOWLEDGE_BASE_VERSION` (`lib/tarot/deck.ts`) when card meanings change — both are stored with each reading.
- Card meanings must stay within traditional Rider-Waite-Smith interpretation. Do not invent historical claims.

## Design system

Midnight `#101827`, Navy `#17263C`, Antique Gold `#C6A15B`, Ivory `#F0E9DA`. Serif headings (Cormorant Garamond + Noto Serif Thai), Noto Sans Thai body. Gold is an accent — use sparingly. Reusable classes: `btn-gold`, `btn-ghost`, `btn-quiet`, `panel`, `panel-gold`, `eyebrow`, `field`, `chip` (see `app/globals.css`). Keep WCAG AA contrast, visible focus, `prefers-reduced-motion` support, and a skip-animation path for card reveals.

## Before claiming a change is done

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```
