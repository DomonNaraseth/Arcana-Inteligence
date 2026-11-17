import type { Element, TarotCard } from "../types";

export const RANKS = [
  "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
] as const;

const RANK_EN: Record<string, string> = {
  ace: "Ace", two: "Two", three: "Three", four: "Four", five: "Five",
  six: "Six", seven: "Seven", eight: "Eight", nine: "Nine", ten: "Ten",
  page: "Page", knight: "Knight", queen: "Queen", king: "King",
};

const RANK_TH: Record<string, string> = {
  ace: "เอซ", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", page: "เด็กถือสาร", knight: "อัศวิน",
  queen: "ราชินี", king: "ราชา",
};

const SUIT_META = {
  wands: { en: "Wands", th: "ไม้เท้า", element: "fire" as Element },
  cups: { en: "Cups", th: "ถ้วย", element: "water" as Element },
  swords: { en: "Swords", th: "ดาบ", element: "air" as Element },
  pentacles: { en: "Pentacles", th: "เหรียญ", element: "earth" as Element },
};

export interface MinorRow {
  k: string[];
  kr: string[];
  up: string;
  rev: string;
  love: string;
  career: string;
  fin: string;
  advice: string;
}

export function buildSuit(
  suit: keyof typeof SUIT_META,
  rows: MinorRow[],
): TarotCard[] {
  if (rows.length !== 14) {
    throw new Error(`Suit ${suit} must have 14 cards, got ${rows.length}`);
  }
  const meta = SUIT_META[suit];
  return rows.map((r, i) => {
    const rank = RANKS[i];
    const id = `${rank}-of-${suit}`;
    return {
      id,
      name: `${RANK_EN[rank]} of ${meta.en}`,
      nameTh: `${RANK_TH[rank]} ${meta.th}`,
      arcana: "minor",
      suit,
      number: i + 1,
      element: meta.element,
      image: `/cards/${id}.jpg`,
      keywords: r.k,
      keywordsReversed: r.kr,
      uprightTh: r.up,
      reversedTh: r.rev,
      loveTh: r.love,
      careerTh: r.career,
      financeTh: r.fin,
      adviceTh: r.advice,
    };
  });
}
