import { randomInt } from "node:crypto";

/**
 * Picks the card a visitor receives from an oracle deck. Chance comes from
 * node:crypto only — the AI never chooses a card (the spirit of rule 1).
 */
export function drawOracleCard<T>(cards: readonly T[]): T {
  if (cards.length === 0) throw new Error("empty deck");
  return cards[randomInt(cards.length)];
}
