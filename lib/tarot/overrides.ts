import { z } from "zod";
import type { Spread, TarotCard } from "./types";

/**
 * Admin overrides of the knowledge base *text*. Structure — ids, arcana,
 * suit, element, numbering, images, card counts, position keys — is not
 * overridable, so a bad edit can never break a draw or an old reading.
 */

const keywordList = z.array(z.string().trim().min(1).max(40)).min(3).max(8);
const meaning = (max: number) => z.string().trim().min(15).max(max);

export const cardOverrideSchema = z
  .object({
    nameTh: z.string().trim().min(1).max(60),
    keywords: keywordList,
    keywordsReversed: keywordList,
    uprightTh: meaning(700),
    reversedTh: meaning(700),
    loveTh: meaning(500),
    careerTh: meaning(500),
    financeTh: meaning(500),
    adviceTh: meaning(400),
  })
  .partial()
  .strict();

export type CardOverride = z.infer<typeof cardOverrideSchema>;

export const CARD_TEXT_FIELDS = [
  "uprightTh",
  "reversedTh",
  "loveTh",
  "careerTh",
  "financeTh",
  "adviceTh",
] as const;

export const spreadOverrideSchema = z
  .object({
    nameTh: z.string().trim().min(1).max(60),
    descriptionTh: z.string().trim().min(10).max(400),
    interpretationStrategyTh: z.string().trim().min(10).max(600),
    /** one entry per position, in order; length must equal the spread's card count */
    positions: z
      .array(
        z.object({
          nameTh: z.string().trim().min(1).max(60),
          meaningTh: z.string().trim().min(3).max(200),
        }),
      )
      .min(1)
      .max(12),
  })
  .partial()
  .strict();

export type SpreadOverride = z.infer<typeof spreadOverrideSchema>;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Applies an override row. Anything invalid is ignored — the default wins. */
export function applyCardOverride(card: TarotCard, raw: unknown): TarotCard {
  const parsed = cardOverrideSchema.safeParse(raw);
  if (!parsed.success) return card;
  const defined = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );
  return { ...card, ...defined };
}

export function applySpreadOverride(spread: Spread, raw: unknown): Spread {
  const parsed = spreadOverrideSchema.safeParse(raw);
  if (!parsed.success) return spread;
  const o = parsed.data;
  const positions =
    o.positions && o.positions.length === spread.positions.length
      ? spread.positions.map((p, i) => ({
          ...p,
          nameTh: o.positions![i].nameTh,
          meaningTh: o.positions![i].meaningTh,
        }))
      : spread.positions;
  return {
    ...spread,
    nameTh: o.nameTh ?? spread.nameTh,
    descriptionTh: o.descriptionTh ?? spread.descriptionTh,
    interpretationStrategyTh: o.interpretationStrategyTh ?? spread.interpretationStrategyTh,
    positions,
  };
}

/** Keeps only the fields that differ from the shipped default. */
export function diffCard(base: TarotCard, input: CardOverride): CardOverride {
  const out: CardOverride = {};
  if (input.nameTh !== undefined && input.nameTh !== base.nameTh) out.nameTh = input.nameTh;
  if (input.keywords && !sameList(input.keywords, base.keywords)) out.keywords = input.keywords;
  if (input.keywordsReversed && !sameList(input.keywordsReversed, base.keywordsReversed)) {
    out.keywordsReversed = input.keywordsReversed;
  }
  for (const f of CARD_TEXT_FIELDS) {
    const v = input[f];
    if (v !== undefined && v !== base[f]) out[f] = v;
  }
  return out;
}

export function diffSpread(base: Spread, input: SpreadOverride): SpreadOverride {
  const out: SpreadOverride = {};
  if (input.nameTh !== undefined && input.nameTh !== base.nameTh) out.nameTh = input.nameTh;
  if (input.descriptionTh !== undefined && input.descriptionTh !== base.descriptionTh) {
    out.descriptionTh = input.descriptionTh;
  }
  if (
    input.interpretationStrategyTh !== undefined &&
    input.interpretationStrategyTh !== base.interpretationStrategyTh
  ) {
    out.interpretationStrategyTh = input.interpretationStrategyTh;
  }
  if (
    input.positions &&
    input.positions.some(
      (p, i) =>
        p.nameTh !== base.positions[i]?.nameTh || p.meaningTh !== base.positions[i]?.meaningTh,
    )
  ) {
    out.positions = input.positions;
  }
  return out;
}

function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Version stamp stored with every reading: the shipped version alone when
 * nothing is overridden, otherwise suffixed with a hash of the overrides, so
 * any edit to the knowledge base yields a new, reproducible stamp.
 */
export function knowledgeVersion(
  base: string,
  overrides: { cards: Record<string, unknown>; spreads: Record<string, unknown> },
): string {
  if (Object.keys(overrides.cards).length === 0 && Object.keys(overrides.spreads).length === 0) {
    return base;
  }
  return `${base}+kb-${fnv1a(stable(overrides))}`;
}
