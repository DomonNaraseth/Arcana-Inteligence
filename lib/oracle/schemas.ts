import { z } from "zod";

/**
 * Oracle deck studio — the shapes the owner fills in (brief), the AI returns
 * (concept, card texts) and the database stores. Text is Thai for people,
 * English where an image model reads it (art direction, visual scenes).
 */

export const ORACLE_PROMPT_VERSION = "arcana-oracle-2026.11-v1";

/** Ready-made art directions; "custom" uses the owner's own words. */
export const ART_STYLES = [
  {
    id: "gilded-night",
    th: "ภาพวาดละเอียด โทนกรมท่า-ทอง แสงเทียน",
    en: "richly detailed painterly illustration, deep midnight navy and antique gold, candle-lit chiaroscuro, fine gold-leaf linework, mystical and calm",
  },
  {
    id: "watercolor",
    th: "สีน้ำนุ่มนวล โทนพาสเทล",
    en: "soft watercolor illustration on textured paper, gentle pastel washes, delicate ink outlines, airy and hopeful",
  },
  {
    id: "thai-mural",
    th: "จิตรกรรมฝาผนังไทยร่วมสมัย",
    en: "contemporary interpretation of Thai temple mural painting, flat perspective, ornamental kanok flame patterns, muted earth reds and gold leaf, elegant and respectful",
  },
  {
    id: "botanical",
    th: "ภาพพฤกษศาสตร์วินเทจ",
    en: "vintage botanical engraving style with hand-tinted color, detailed flora and fauna, cream paper, sepia and sage tones",
  },
  {
    id: "celestial-minimal",
    th: "มินิมอล เส้นทอง ดวงดาว",
    en: "minimal celestial line art, thin gold lines on deep indigo, stars, moon phases and sacred geometry, generous negative space",
  },
  {
    id: "ink-wash",
    th: "หมึกจีน/ญี่ปุ่น ลายพู่กัน",
    en: "East Asian ink wash painting, expressive brush strokes, sumi ink with a single accent color, misty landscapes, serene",
  },
] as const;
export type ArtStyleId = (typeof ART_STYLES)[number]["id"] | "custom";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const briefSchema = z.object({
  idea: text(10, 1500),
  purpose: text(0, 600).default(""),
  audience: text(0, 300).default(""),
  tone: text(0, 200).default(""),
  card_count: z.number().int().min(8).max(78),
  art_style: z.enum(["custom", ...ART_STYLES.map((s) => s.id)] as [ArtStyleId, ...ArtStyleId[]]),
  custom_style: text(0, 600).default(""),
});
export type OracleBrief = z.infer<typeof briefSchema>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const styleSchema = z.object({
  /** English, for the image model */
  art_direction: text(20, 900),
  palette: z.array(z.object({ name: text(1, 40), hex })).min(3).max(7),
  motifs: z.array(text(1, 80)).min(2).max(10),
  composition: text(10, 600),
  cover_design: text(10, 600),
  back_design: text(10, 600),
});

export const conceptSchema = z.object({
  title: text(1, 80),
  title_en: text(1, 80),
  tagline: text(1, 200),
  story: text(20, 1800),
  how_to_use: text(20, 1500),
  themes: z.array(text(1, 80)).min(1).max(8),
  audience: text(1, 300),
  tone: text(1, 200),
  guidebook_intro: text(20, 1800),
  style: styleSchema,
  cards: z
    .array(z.object({ number: z.number().int().min(1), name: text(1, 60), name_en: text(1, 60), essence: text(1, 220) }))
    .min(4)
    .max(78),
});
export type OracleConceptDraft = z.infer<typeof conceptSchema>;
/** What is kept in arcana_oracle_decks.concept (the card list lives in its own table). */
export type OracleConcept = Omit<OracleConceptDraft, "cards" | "title" | "title_en" | "tagline">;

export const cardTextSchema = z.object({
  number: z.number().int().min(1),
  keywords: z.array(text(1, 40)).min(2).max(6),
  meaning: text(20, 1400),
  message: text(20, 900),
  affirmation: text(4, 240),
  reflection: text(4, 240),
  /** English scene description for the image model */
  visual: text(20, 900),
});
export const cardTextsSchema = z.object({ cards: z.array(cardTextSchema).min(1).max(12) });
export type OracleCardText = z.infer<typeof cardTextSchema>;

/** A deck as the database returns it (arcana_oracle_deck_json). */
export interface OracleCard {
  number: number;
  name: string;
  name_en: string;
  essence: string;
  keywords: string[];
  meaning: string;
  message: string;
  affirmation: string;
  reflection: string;
  visual: string;
  image: string | null;
  image_status: "none" | "ready" | "failed";
  image_error: string | null;
}

export interface OracleDeck {
  id: string;
  slug: string;
  title: string;
  title_en: string;
  tagline: string;
  brief?: Partial<OracleBrief>;
  concept: Partial<OracleConcept>;
  card_count: number;
  status: "draft" | "published";
  cover_image: string | null;
  back_image: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  cards: OracleCard[];
}

/** Where an oracle picture is served from (bytes live in the database). */
export const oracleImageUrl = (id: string) => `/api/oracle/image/${id}`;
