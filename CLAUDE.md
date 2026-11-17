# ARCANA INTELLIGENCE — project rules

AI Tarot & Life Guidance platform. Thai-first UI. Read `docs/ARCHITECTURE.md` before changing structure.

## Non-negotiable product rules

1. **The AI never chooses or alters cards.** Cards come only from `lib/tarot/draw.ts` (node:crypto). The AI receives drawn cards and interprets them.
2. **No fake readings.** If the AI provider is not configured or fails, show the Configuration Missing / error state. Never render mock interpretation text.
3. **Drawn cards are immutable.** `arcana_reading_cards` has no UPDATE/DELETE policy. Follow-up draws append `is_followup` rows; they never replace the original spread.
4. **Every interpretation passes `verifyInterpretation`** (card ids and positions checked in code) before it is saved. Usage is logged only after a successful save — failed AI calls are never counted against the user.
5. **Direct answer first.** The reading output always leads with `direct_answer`.
6. **Responsible guidance.** No guaranteed outcomes, no death/illness/disaster predictions, no medical/legal/investment directives, no claims about third parties' private thoughts, no fear-based retention. These live in `CORE_PERSONA` (`lib/ai/prompts.ts`) — do not weaken them.

## Architecture conventions

- Modular monolith. Business logic lives in `lib/` and never imports from `components/` or `app/`.
  - `lib/tarot/` — knowledge base (78 cards), spreads, randomization, deterministic spread statistics
  - `lib/ai/` — provider adapter, layered prompts (L1–L6), Zod schemas, engine (analyze / interpret / follow-up), heuristic fallback
  - `lib/data/` — Supabase data access, usage logging, quotas
  - `lib/supabase/` — request context (`getContext()`), browser auth client
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
