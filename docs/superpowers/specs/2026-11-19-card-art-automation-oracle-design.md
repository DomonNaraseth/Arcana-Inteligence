# Card art in readings, finished automation, and the admin Oracle deck studio

Request (owner, 2026-11-19), in three parts:
1. Make readings look good with card pictures and make them easy to read.
2. Finish the automation: payments and the other recurring work.
3. Build an Oracle-card creator in Admin. AI plans the concept, writes every card, and paints the art. Everything needed to finish a deck is included.

The owner asked for decisions to be made without questions, so this spec records them.

## 1. Card art in the reading

**Goal.** A reader always sees which card a sentence is about, and the text is comfortable to read on a phone.

- **Cards section (03).** Each card row shows its card art: a thumbnail of about 56 px in the folded row, and a larger image beside the text when the row is open. Reversed cards are shown rotated. The position number moves into a small badge on the thumbnail.
- **Close examples.** Each card chip carries a tiny thumbnail of its card.
- **Card names in text.** Wherever a drawn card's English or Thai name appears in the direct answer, the examples, the card texts or the conclusion, it is marked in gold. Its accessible name says the card and its orientation.
  - The splitting is a pure function, `splitCardMentions()`, and it is unit-tested.
- **Direct answer.** The type is set slightly smaller, `text-lg sm:text-xl` with a line height of 1.8, so long Thai answers read comfortably. A row of the drawn cards' thumbnails sits above the answer.
- **Data.** Images come from the existing `public/cards/*.jpg` via `card.image`. The effective knowledge base still provides every name (rule 9).

## 2. Automation

**Payments.**
- Automatic slip checking (SlipOK) is built and switched on. Production calls now get a 1000 answer even on the quota request, which means SlipOK is refusing the branch id in the URL. That is a setting the owner corrects on Vercel.
- Admin → Payments → "ตรวจการเชื่อมต่อ SlipOK" reports what SlipOK answered and the shape of each setting. It never shows a key.
- **Bank-delay retry.** When SlipOK says a bank has not reported a transfer yet (codes 1009/1010), the pay page keeps the chosen slip and retries by itself after a countdown. It tries up to 3 times, about 2 minutes apart, and tells the customer it is doing so.
  - The slip route returns a machine `reason` next to its Thai message.

**Housekeeping.** A daily Vercel cron (`/api/cron/daily`, guarded by `CRON_SECRET`, which Vercel sets for cron calls) does two things:
- **Expires stale PromptPay orders.** It closes orders that have stayed pending with no claim for more than 48 hours, through `arcana_expire_stale_payments()`. That function writes nothing else and grants nothing.
- **Prepares today's daily-card messages.** It does not pre-generate them. The message of the day stays lazily generated per card, as rule 11 requires.

Owner notifications (LINE or Telegram) stay as built. They need the owner's own tokens.

## 3. Oracle deck studio (Admin)

**Purpose.** The owner designs a complete oracle deck in a few sittings: concept → card texts → art → review → print files → publish.

**Data** (migration `0011_arcana_oracle`)
- `arcana_oracle_decks` holds the deck:
  - id, slug, title (Thai and English), tagline;
  - `concept` (jsonb): story, how to use, themes, audience, tone, visual style guide (palette hexes, motifs, composition and lighting), card-back idea and guidebook introduction;
  - card_count, art style;
  - image paths for the cover and the card back;
  - status `draft | published`, plus timestamps.
- `arcana_oracle_cards` holds each card:
  - deck_id, number, name in Thai and English, keywords[];
  - meaning, message, affirmation, reflection question;
  - visual scene, image prompt, image path, image state.
  - Each (deck_id, number) pair is unique.
- **Who can do what.** Admins write only through SECURITY DEFINER `arcana_admin_oracle_*` functions. Each calls `arcana_require_admin()` and writes `arcana_audit_logs` (rule 8). The public can read published decks and their cards only.
- **Images.** Images are stored as compact WebP (resized to ≤1024 px with sharp, roughly 150–300 KB each) in `arcana_oracle_images`.
  - A `bytea` column holds the bytes; each image is capped at 3 MB.
  - A repaint deletes the picture it replaces.
  - They are served by `/api/oracle/image/[id]`. Published pictures are cached for a year, since their ids never change; drafts are admin-only and use `no-store`.
  - Supabase Storage was rejected for two reasons. Its policies cannot see our server header, which `arcana_is_admin()` needs. And it would mean adding objects outside the `arcana_` tables in a shared project.

**AI**
- **Concept.** `generate()` (Claude, deep tier) receives the owner's brief: idea, purpose, audience, tone, number of cards (8–78), art style preset or a custom style. It returns JSON validated by Zod: names, story, themes, a visual style guide and a card list (name plus a one-line essence).
- **Card texts.** These are written in batches of 8 cards per call, using the concept as shared context. The persona rules of CORE_PERSONA apply: no guarantees, no fear, no medical, legal or financial directives.
- **Art.** Vercel AI Gateway `POST /v1/images/generations`, using the same token as text AI, which is the deployment OIDC token.
  - Models are tried in order: `openai/gpt-image-2` (portrait 1024×1536), then `bfl/flux-2-pro`. The model that works is remembered.
  - The prompt is built in code: the deck style guide, the card's scene, and fixed rules (no lettering, no text, no borders, portrait, the same palette).
  - **Thai names are never painted.** The site's card frame overlays the name in Thai type, because image models write Thai badly.
- **Pacing.** One card per request, so no request hits the time limit. "Generate all" runs card by card in the browser with progress, and can be stopped and resumed.

**Screens** (`/admin/oracle`)
- **List of decks.** Cover, status and progress (texts x/N, art x/N).
- **New deck.** A brief form, then "AI วางคอนเซป".
- **Studio for one deck**, with tabs:
  - คอนเซป: editable;
  - ไพ่: card grid; each card's texts can be edited, regenerated, or have its art regenerated;
  - ภาพปก/หลังไพ่;
  - ไฟล์พิมพ์;
  - เผยแพร่.
- **Print page** (`/admin/oracle/[id]/print`):
  - every card front with its frame, at 70×120 mm with 3 mm bleed;
  - the card back;
  - the guidebook (introduction, how to use, one entry per card).
  - Browser print to PDF.
- **Public page** (`/oracle/[slug]`), once published:
  - the gallery;
  - "ขอสารจากไพ่หนึ่งใบ". The card is drawn on the server with `node:crypto` (`lib/oracle/draw.ts`). The AI never chooses a card, in the spirit of rule 1.

**Failure states.**
- If no AI text or image provider is configured, or the gateway refuses, the studio shows the real error. It never shows placeholder art or text (rule 2).
- A failed image leaves the card's art state as `failed`, with a retry button.

## Testing

- **Unit tests:**
  - `splitCardMentions`;
  - the Oracle concept and card schemas;
  - prompt building (no lettering rule, style guide included);
  - `drawOracleCard` (range and uniformity smoke test);
  - the slip `reason` mapping.
- **Production checks:**
  - deck creation, concept and card texts through Claude;
  - one image through the gateway;
  - storage upload and the public read;
  - the print page;
  - the public draw;
  - the cron route answering 401 without the secret.
