import type { TarotCard } from "./types";
import { MAJOR_ARCANA } from "./data/major";
import { WANDS } from "./data/wands";
import { CUPS } from "./data/cups";
import { SWORDS } from "./data/swords";
import { PENTACLES } from "./data/pentacles";

/** Knowledge-base version — stored with every reading for auditability. */
export const KNOWLEDGE_BASE_VERSION = "rws-th-1.0.0";

export const DECK: TarotCard[] = [
  ...MAJOR_ARCANA,
  ...WANDS,
  ...CUPS,
  ...SWORDS,
  ...PENTACLES,
];

if (DECK.length !== 78) {
  throw new Error(`Deck must contain 78 cards, found ${DECK.length}`);
}

const BY_ID = new Map(DECK.map((c) => [c.id, c]));

export function getCard(id: string): TarotCard | undefined {
  return BY_ID.get(id);
}

export function requireCard(id: string): TarotCard {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export const ELEMENT_TH: Record<string, string> = {
  fire: "ไฟ",
  water: "น้ำ",
  air: "ลม",
  earth: "ดิน",
  spirit: "จิตวิญญาณ",
};

export const SUIT_TH: Record<string, string> = {
  wands: "ไม้เท้า",
  cups: "ถ้วย",
  swords: "ดาบ",
  pentacles: "เหรียญ",
};
