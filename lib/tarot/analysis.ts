import { requireCard, ELEMENT_TH, SUIT_TH } from "./deck";
import type { DrawnCard } from "./types";

/**
 * Deterministic structural analysis of a drawn spread (layers 5–8 of the
 * ten-layer method). Computed in code — not by the AI — so the numbers the
 * model reasons over are always verifiable.
 */
export interface SpreadStats {
  total: number;
  majorCount: number;
  majorRatio: number;
  uprightCount: number;
  reversedCount: number;
  elements: Record<string, number>;
  suits: Record<string, number>;
  dominantElement: string | null;
  missingElements: string[];
  courtCount: number;
  repeatedNumbers: { number: number; count: number }[];
  summaryTh: string;
}

export function computeSpreadStats(cards: DrawnCard[]): SpreadStats {
  const elements: Record<string, number> = { fire: 0, water: 0, air: 0, earth: 0 };
  const suits: Record<string, number> = { wands: 0, cups: 0, swords: 0, pentacles: 0 };
  const numbers = new Map<number, number>();
  let majorCount = 0;
  let reversedCount = 0;
  let courtCount = 0;

  for (const d of cards) {
    const c = requireCard(d.cardId);
    if (c.arcana === "major") majorCount++;
    if (d.orientation === "reversed") reversedCount++;
    if (c.element in elements) elements[c.element]++;
    if (c.suit) {
      suits[c.suit]++;
      if (c.number >= 11) courtCount++;
      else numbers.set(c.number, (numbers.get(c.number) ?? 0) + 1);
    }
  }

  const total = cards.length;
  const sortedEl = Object.entries(elements).sort((a, b) => b[1] - a[1]);
  const dominantElement =
    sortedEl[0][1] > 0 && sortedEl[0][1] > (sortedEl[1]?.[1] ?? 0) ? sortedEl[0][0] : null;
  const missingElements = total >= 4 ? sortedEl.filter(([, n]) => n === 0).map(([e]) => e) : [];
  const repeatedNumbers = [...numbers.entries()]
    .filter(([, count]) => count >= 2)
    .map(([number, count]) => ({ number, count }));

  const parts: string[] = [];
  parts.push(`ไพ่ทั้งหมด ${total} ใบ: Major Arcana ${majorCount} ใบ, Minor Arcana ${total - majorCount} ใบ`);
  parts.push(`ตั้งตรง ${total - reversedCount} ใบ, กลับหัว ${reversedCount} ใบ`);
  parts.push(
    "ธาตุ: " +
      Object.entries(elements)
        .map(([e, n]) => `${ELEMENT_TH[e]} ${n}`)
        .join(", "),
  );
  const suitParts = Object.entries(suits).filter(([, n]) => n > 0);
  if (suitParts.length) {
    parts.push("ชุดไพ่: " + suitParts.map(([s, n]) => `${SUIT_TH[s]} ${n}`).join(", "));
  }
  if (dominantElement) parts.push(`ธาตุเด่น: ${ELEMENT_TH[dominantElement]}`);
  if (missingElements.length) {
    parts.push(`ธาตุที่ขาดหาย: ${missingElements.map((e) => ELEMENT_TH[e]).join(", ")}`);
  }
  if (courtCount) parts.push(`ไพ่บุคคล (Court) ${courtCount} ใบ`);
  if (repeatedNumbers.length) {
    parts.push(
      "เลขที่ซ้ำ: " + repeatedNumbers.map((r) => `เลข ${r.number} ×${r.count}`).join(", "),
    );
  }

  return {
    total,
    majorCount,
    majorRatio: total ? majorCount / total : 0,
    uprightCount: total - reversedCount,
    reversedCount,
    elements,
    suits,
    dominantElement,
    missingElements,
    courtCount,
    repeatedNumbers,
    summaryTh: parts.join(" | "),
  };
}
