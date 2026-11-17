import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { heuristicAnalysis } from "@/lib/ai/heuristics";
import { extractJson } from "@/lib/ai/provider";
import { computeSpreadStats } from "@/lib/tarot/analysis";
import { DECK, getCard } from "@/lib/tarot/deck";
import { dailyCardIndex, drawAdditional, drawForSpread } from "@/lib/tarot/draw";
import { SPREADS, getSpread } from "@/lib/tarot/spreads";

describe("tarot knowledge base", () => {
  it("has exactly 78 unique cards", () => {
    expect(DECK).toHaveLength(78);
    expect(new Set(DECK.map((c) => c.id)).size).toBe(78);
  });

  it("has 22 major and 14 cards per suit", () => {
    expect(DECK.filter((c) => c.arcana === "major")).toHaveLength(22);
    for (const suit of ["wands", "cups", "swords", "pentacles"]) {
      expect(DECK.filter((c) => c.suit === suit)).toHaveLength(14);
    }
  });

  it("every card has complete structured knowledge and an image file", () => {
    for (const c of DECK) {
      for (const field of [c.uprightTh, c.reversedTh, c.loveTh, c.careerTh, c.financeTh, c.adviceTh]) {
        expect(field.length, `${c.id} has an empty field`).toBeGreaterThan(15);
      }
      expect(c.keywords.length).toBeGreaterThanOrEqual(3);
      expect(c.keywordsReversed.length).toBeGreaterThanOrEqual(3);
      expect(existsSync(path.join(process.cwd(), "public", c.image)), `${c.image} missing`).toBe(true);
    }
  });
});

describe("spread catalog", () => {
  it("defines at least 15 spreads with unique ids", () => {
    expect(SPREADS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(SPREADS.map((s) => s.id)).size).toBe(SPREADS.length);
  });

  it("card count always matches the number of positions", () => {
    for (const s of SPREADS) {
      expect(s.positions, s.id).toHaveLength(s.cardCount);
      expect(new Set(s.positions.map((p) => p.key)).size, s.id).toBe(s.cardCount);
    }
  });
});

describe("secure randomization engine", () => {
  it("draws the right number of unique, valid cards for every spread", () => {
    for (const s of SPREADS) {
      const { cards } = drawForSpread(s);
      expect(cards).toHaveLength(s.cardCount);
      expect(new Set(cards.map((c) => c.cardId)).size).toBe(s.cardCount);
      cards.forEach((c, i) => {
        expect(getCard(c.cardId)).toBeDefined();
        expect(c.position).toBe(i + 1);
        expect(c.positionKey).toBe(s.positions[i].key);
      });
    }
  });

  it("honours the configured reversal probability", () => {
    const spread = getSpread("celtic_cross")!;
    expect(
      drawForSpread(spread, { reversalProbability: 0 }).cards.every((c) => c.orientation === "upright"),
    ).toBe(true);
    expect(
      drawForSpread(spread, { reversalProbability: 1 }).cards.every((c) => c.orientation === "reversed"),
    ).toBe(true);
  });

  it("reaches every card in the deck over many draws", () => {
    const seen = new Set<string>();
    const spread = getSpread("yearly_forecast")!;
    for (let i = 0; i < 200; i++) drawForSpread(spread).cards.forEach((c) => seen.add(c.cardId));
    expect(seen.size).toBe(78);
  });

  it("additional draws never repeat cards already on the table", () => {
    const spread = getSpread("celtic_cross")!;
    for (let i = 0; i < 50; i++) {
      const existing = drawForSpread(spread).cards.map((c) => c.cardId);
      const extra = drawAdditional(3, existing, 11);
      expect(extra).toHaveLength(3);
      extra.forEach((c) => {
        expect(existing).not.toContain(c.cardId);
        expect(c.isFollowup).toBe(true);
      });
      expect(extra.map((c) => c.position)).toEqual([11, 12, 13]);
    }
  });

  it("daily card is stable for the same seed", () => {
    expect(dailyCardIndex("g:abc|2026-11-18")).toEqual(dailyCardIndex("g:abc|2026-11-18"));
    expect(dailyCardIndex("x").index).toBeLessThan(78);
  });
});

describe("structural analysis", () => {
  it("counts arcana, orientation and elements", () => {
    const stats = computeSpreadStats([
      { position: 1, positionKey: "a", cardId: "the-sun", orientation: "upright" },
      { position: 2, positionKey: "b", cardId: "ace-of-wands", orientation: "reversed" },
      { position: 3, positionKey: "c", cardId: "two-of-cups", orientation: "upright" },
      { position: 4, positionKey: "d", cardId: "knight-of-wands", orientation: "upright" },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.majorCount).toBe(1);
    expect(stats.reversedCount).toBe(1);
    expect(stats.elements.fire).toBe(3);
    expect(stats.dominantElement).toBe("fire");
    expect(stats.missingElements).toEqual(expect.arrayContaining(["air", "earth"]));
    expect(stats.courtCount).toBe(1);
  });
});

describe("question heuristics (fallback classifier)", () => {
  it("always recommends an existing spread", () => {
    const questions = [
      "ช่วงนี้งานของฉันจะเป็นอย่างไรบ้าง",
      "เขายังรักฉันไหม",
      "ฉันควรรับงานนี้หรืออยู่ที่เดิมดี",
      "ปีหน้าชีวิตฉันจะเป็นอย่างไร",
      "ทะเลาะกับแฟน จะคืนดีกันได้ไหม",
      "ธุรกิจที่จะเปิดไปรอดไหม",
      "อืม",
    ];
    for (const q of questions) {
      const a = heuristicAnalysis(q);
      expect(getSpread(a.recommended_spread), q).toBeDefined();
      expect(a.source).toBe("heuristic");
    }
  });

  it("routes common intents to the expected spread", () => {
    expect(heuristicAnalysis("ปีหน้าชีวิตฉันจะเป็นอย่างไร").recommended_spread).toBe("yearly_forecast");
    expect(heuristicAnalysis("ทะเลาะกับแฟน จะคืนดีกันได้ไหม").recommended_spread).toBe("conflict_reconciliation");
    expect(heuristicAnalysis("ฉันอยากลาออกไปทำงานใหม่").recommended_spread).toBe("career_change");
  });
});

describe("model output parsing", () => {
  it("extracts JSON wrapped in prose or code fences", () => {
    expect(extractJson('ผลลัพธ์:\n```json\n{"a": {"b": "x}y"}, "c": 1}\n```\nจบ')).toEqual({
      a: { b: "x}y" },
      c: 1,
    });
  });

  it("throws when no JSON object exists", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
