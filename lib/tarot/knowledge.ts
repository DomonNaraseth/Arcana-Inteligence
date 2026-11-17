import type { SupabaseClient } from "@supabase/supabase-js";
import { DECK, KNOWLEDGE_BASE_VERSION } from "./deck";
import { applyCardOverride, applySpreadOverride, knowledgeVersion } from "./overrides";
import { DEFAULT_SPREAD_ID, SPREADS } from "./spreads";
import type { Spread, TarotCard } from "./types";

/**
 * The effective knowledge base: shipped defaults with admin overrides
 * applied. Everything user-facing and everything sent to the AI reads from
 * here, so an edit in Admin → Knowledge reaches the whole product.
 */
export interface Knowledge {
  /** stamp stored with each reading and analysis */
  version: string;
  cards: TarotCard[];
  spreads: Spread[];
  card(id: string): TarotCard | undefined;
  requireCard(id: string): TarotCard;
  spread(id: string): Spread | undefined;
  /** falls back to the default spread for unknown ids (e.g. a retired spread) */
  resolveSpread(id: string | null | undefined): Spread;
  overridden: { cards: Set<string>; spreads: Set<string> };
}

interface RawOverrides {
  cards: Record<string, unknown>;
  spreads: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildKnowledge(raw: unknown): Knowledge {
  const source = asRecord(raw);
  const overrides: RawOverrides = {
    cards: asRecord(source.cards),
    spreads: asRecord(source.spreads),
  };

  const cards = DECK.map((c) =>
    c.id in overrides.cards ? applyCardOverride(c, overrides.cards[c.id]) : c,
  );
  const spreads = SPREADS.map((s) =>
    s.id in overrides.spreads ? applySpreadOverride(s, overrides.spreads[s.id]) : s,
  );
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const spreadById = new Map(spreads.map((s) => [s.id, s]));

  // only overrides of entities that exist count towards the version
  const effective: RawOverrides = {
    cards: Object.fromEntries(Object.entries(overrides.cards).filter(([id]) => cardById.has(id))),
    spreads: Object.fromEntries(
      Object.entries(overrides.spreads).filter(([id]) => spreadById.has(id)),
    ),
  };

  return {
    version: knowledgeVersion(KNOWLEDGE_BASE_VERSION, effective),
    cards,
    spreads,
    card: (id) => cardById.get(id),
    requireCard: (id) => {
      const card = cardById.get(id);
      if (!card) throw new Error(`Unknown card id: ${id}`);
      return card;
    },
    spread: (id) => spreadById.get(id),
    resolveSpread: (id) => spreadById.get(id ?? "") ?? spreadById.get(DEFAULT_SPREAD_ID)!,
    overridden: {
      cards: new Set(Object.keys(effective.cards)),
      spreads: new Set(Object.keys(effective.spreads)),
    },
  };
}

/** Shipped defaults only — used when the database is unavailable. */
export const DEFAULT_KNOWLEDGE = buildKnowledge(null);

const TTL_MS = 30_000;
let cache: { value: Knowledge; at: number } | null = null;

export function invalidateKnowledge() {
  cache = null;
}

export async function getKnowledge(
  supabase: SupabaseClient,
  opts: { fresh?: boolean } = {},
): Promise<Knowledge> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data, error } = await supabase.rpc("arcana_kb_overrides");
  if (error) {
    console.error("[arcana] knowledge overrides load failed, using defaults:", error.message);
    return cache?.value ?? DEFAULT_KNOWLEDGE;
  }
  const value = buildKnowledge(data);
  cache = { value, at: Date.now() };
  return value;
}
