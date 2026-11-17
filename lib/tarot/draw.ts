import { randomInt } from "node:crypto";
import { DECK } from "./deck";
import type { DrawnCard, Spread } from "./types";

/**
 * Secure Randomization Engine.
 *
 * Completely independent of the AI layer: the AI never chooses or alters
 * cards. Uses node:crypto (CSPRNG) with an unbiased Fisher–Yates shuffle.
 */

export const DEFAULT_REVERSAL_PROBABILITY = 0.35;

export interface DrawOptions {
  /** 0..1 chance that each card lands reversed */
  reversalProbability?: number;
  /** card ids that may not be drawn (e.g. already on the table) */
  exclude?: string[];
}

export interface DrawResult {
  cards: DrawnCard[];
  meta: {
    algorithm: "csprng-fisher-yates";
    deckSize: number;
    reversalProbability: number;
    drawnAt: string;
  };
}

function secureShuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function secureChance(probability: number): boolean {
  // 1e6 buckets gives 0.0001% resolution, unbiased via randomInt
  return randomInt(0, 1_000_000) < Math.round(probability * 1_000_000);
}

export function drawForSpread(spread: Spread, options: DrawOptions = {}): DrawResult {
  const reversalProbability = clamp01(
    options.reversalProbability ?? DEFAULT_REVERSAL_PROBABILITY,
  );
  const exclude = new Set(options.exclude ?? []);
  const pool = DECK.filter((c) => !exclude.has(c.id));
  if (pool.length < spread.cardCount) {
    throw new Error("Not enough cards left in the deck to draw this spread");
  }
  const shuffled = secureShuffle(pool);
  const cards: DrawnCard[] = spread.positions.map((pos, i) => ({
    position: i + 1,
    positionKey: pos.key,
    cardId: shuffled[i].id,
    orientation: secureChance(reversalProbability) ? "reversed" : "upright",
  }));
  return {
    cards,
    meta: {
      algorithm: "csprng-fisher-yates",
      deckSize: pool.length,
      reversalProbability,
      drawnAt: new Date().toISOString(),
    },
  };
}

/** Draw extra clarifier cards without touching the cards already on the table. */
export function drawAdditional(
  count: number,
  existingCardIds: string[],
  startPosition: number,
  options: DrawOptions = {},
): DrawnCard[] {
  const reversalProbability = clamp01(
    options.reversalProbability ?? DEFAULT_REVERSAL_PROBABILITY,
  );
  const exclude = new Set(existingCardIds);
  const pool = DECK.filter((c) => !exclude.has(c.id));
  if (pool.length < count) throw new Error("Not enough cards left in the deck");
  const shuffled = secureShuffle(pool);
  return Array.from({ length: count }, (_, i) => ({
    position: startPosition + i,
    positionKey: `clarifier_${startPosition + i}`,
    cardId: shuffled[i].id,
    orientation: secureChance(reversalProbability) ? ("reversed" as const) : ("upright" as const),
    isFollowup: true,
  }));
}

/**
 * The card of the day: one card from the full deck, drawn with the same CSPRNG
 * as a spread. The caller stores it once per user per day; it is never redrawn.
 */
export function drawDailyCard(options: DrawOptions = {}): { cardId: string; orientation: "upright" | "reversed" } {
  const reversalProbability = clamp01(
    options.reversalProbability ?? DEFAULT_REVERSAL_PROBABILITY,
  );
  const card = DECK[randomInt(0, DECK.length)];
  return { cardId: card.id, orientation: secureChance(reversalProbability) ? "reversed" : "upright" };
}

/** Deterministic pick (not security-sensitive) — kept for previews and tests. */
export function dailyCardIndex(seed: string): { index: number; reversed: boolean } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return { index: u % DECK.length, reversed: ((u >>> 8) % 100) < 30 };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
