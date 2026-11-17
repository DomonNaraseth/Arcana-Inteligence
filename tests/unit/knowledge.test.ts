import { describe, expect, it } from "vitest";
import { interpretationPrompt, questionAnalysisSystem } from "@/lib/ai/prompts";
import { DECK, KNOWLEDGE_BASE_VERSION, requireCard } from "@/lib/tarot/deck";
import { DEFAULT_KNOWLEDGE, buildKnowledge } from "@/lib/tarot/knowledge";
import {
  applyCardOverride,
  applySpreadOverride,
  cardOverrideSchema,
  diffCard,
  diffSpread,
  knowledgeVersion,
  spreadOverrideSchema,
} from "@/lib/tarot/overrides";
import { SPREADS, getSpread } from "@/lib/tarot/spreads";

const fool = requireCard("the-fool");
const yesNo = getSpread("yes_no")!;
const NEW_UPRIGHT = "การเริ่มต้นครั้งใหม่ที่ต้องอาศัยความกล้า และการวางใจในเส้นทางที่ยังมองไม่เห็นปลายทาง";

describe("card overrides", () => {
  it("replaces only the overridden text", () => {
    const edited = applyCardOverride(fool, { uprightTh: NEW_UPRIGHT });
    expect(edited.uprightTh).toBe(NEW_UPRIGHT);
    expect(edited.reversedTh).toBe(fool.reversedTh);
    expect(edited.keywords).toEqual(fool.keywords);
  });

  it("can never change the structure of the deck", () => {
    const edited = applyCardOverride(fool, {
      uprightTh: NEW_UPRIGHT,
      id: "hacked",
      arcana: "minor",
      image: "/evil.jpg",
      element: "earth",
    });
    // strict schema: an override carrying structural keys is rejected whole
    expect(edited).toEqual(fool);
    expect(cardOverrideSchema.safeParse({ id: "x" }).success).toBe(false);
  });

  it("ignores malformed rows instead of breaking the card", () => {
    expect(applyCardOverride(fool, null)).toEqual(fool);
    expect(applyCardOverride(fool, "text")).toEqual(fool);
    expect(applyCardOverride(fool, { uprightTh: "สั้น" })).toEqual(fool);
    expect(applyCardOverride(fool, { keywords: ["one"] })).toEqual(fool);
  });

  it("stores only what differs from the default", () => {
    expect(diffCard(fool, { ...pickText(fool) })).toEqual({});
    expect(diffCard(fool, { ...pickText(fool), adviceTh: NEW_UPRIGHT })).toEqual({ adviceTh: NEW_UPRIGHT });
    expect(diffCard(fool, { keywords: [...fool.keywords].reverse() })).toEqual({
      keywords: [...fool.keywords].reverse(),
    });
  });
});

function pickText(c: typeof fool) {
  return {
    nameTh: c.nameTh,
    keywords: c.keywords,
    keywordsReversed: c.keywordsReversed,
    uprightTh: c.uprightTh,
    reversedTh: c.reversedTh,
    loveTh: c.loveTh,
    careerTh: c.careerTh,
    financeTh: c.financeTh,
    adviceTh: c.adviceTh,
  };
}

describe("spread overrides", () => {
  const positions = yesNo.positions.map((p, i) => ({
    nameTh: i === 0 ? "สัญญาณแรก" : p.nameTh,
    meaningTh: p.meaningTh,
  }));

  it("edits text but keeps position keys and card count", () => {
    const edited = applySpreadOverride(yesNo, { nameTh: "ใช่ / ไม่ใช่", positions });
    expect(edited.nameTh).toBe("ใช่ / ไม่ใช่");
    expect(edited.positions[0].nameTh).toBe("สัญญาณแรก");
    expect(edited.positions.map((p) => p.key)).toEqual(yesNo.positions.map((p) => p.key));
    expect(edited.cardCount).toBe(yesNo.cardCount);
    expect(edited.id).toBe(yesNo.id);
  });

  it("ignores a position list of the wrong length", () => {
    const edited = applySpreadOverride(yesNo, { positions: positions.slice(0, 2) });
    expect(edited.positions).toEqual(yesNo.positions);
  });

  it("rejects structural keys", () => {
    expect(spreadOverrideSchema.safeParse({ cardCount: 99 }).success).toBe(false);
    expect(applySpreadOverride(yesNo, { cardCount: 99, nameTh: "x" })).toEqual(yesNo);
  });

  it("stores only what differs from the default", () => {
    const same = {
      nameTh: yesNo.nameTh,
      descriptionTh: yesNo.descriptionTh,
      interpretationStrategyTh: yesNo.interpretationStrategyTh,
      positions: yesNo.positions.map((p) => ({ nameTh: p.nameTh, meaningTh: p.meaningTh })),
    };
    expect(diffSpread(yesNo, same)).toEqual({});
    expect(Object.keys(diffSpread(yesNo, { ...same, positions }))).toEqual(["positions"]);
  });
});

describe("effective knowledge base", () => {
  it("equals the shipped defaults when nothing is overridden", () => {
    expect(DEFAULT_KNOWLEDGE.version).toBe(KNOWLEDGE_BASE_VERSION);
    expect(DEFAULT_KNOWLEDGE.cards).toEqual(DECK);
    expect(DEFAULT_KNOWLEDGE.spreads).toEqual(SPREADS);
    expect(DEFAULT_KNOWLEDGE.overridden.cards.size).toBe(0);
  });

  it("applies overrides, keeps 78 cards, and tolerates junk rows", () => {
    const kb = buildKnowledge({
      cards: { "the-fool": { uprightTh: NEW_UPRIGHT }, "no-such-card": { uprightTh: NEW_UPRIGHT } },
      spreads: { yes_no: { nameTh: "ใช่ / ไม่ใช่" }, ghost: "junk" },
    });
    expect(kb.cards).toHaveLength(78);
    expect(kb.requireCard("the-fool").uprightTh).toBe(NEW_UPRIGHT);
    expect(kb.requireCard("the-magician")).toEqual(requireCard("the-magician"));
    expect(kb.resolveSpread("yes_no").nameTh).toBe("ใช่ / ไม่ใช่");
    expect([...kb.overridden.cards]).toEqual(["the-fool"]);
    expect([...kb.overridden.spreads]).toEqual(["yes_no"]);
    expect(buildKnowledge("garbage").cards).toEqual(DECK);
  });

  it("resolves unknown spreads to the default spread", () => {
    expect(DEFAULT_KNOWLEDGE.resolveSpread("retired").id).toBe("general");
    expect(DEFAULT_KNOWLEDGE.resolveSpread(null).id).toBe("general");
  });

  it("stamps a new, reproducible version for every distinct edit", () => {
    const a = buildKnowledge({ cards: { "the-fool": { uprightTh: NEW_UPRIGHT } }, spreads: {} });
    const b = buildKnowledge({ cards: { "the-fool": { uprightTh: `${NEW_UPRIGHT} อีกแบบ` } }, spreads: {} });
    const a2 = buildKnowledge({ spreads: {}, cards: { "the-fool": { uprightTh: NEW_UPRIGHT } } });
    expect(a.version).not.toBe(KNOWLEDGE_BASE_VERSION);
    expect(a.version.startsWith(`${KNOWLEDGE_BASE_VERSION}+kb-`)).toBe(true);
    expect(a.version).not.toBe(b.version);
    expect(a.version).toBe(a2.version);
    expect(knowledgeVersion("v1", { cards: {}, spreads: {} })).toBe("v1");
  });
});

describe("edited knowledge reaches the AI", () => {
  it("the interpretation prompt carries the overridden meaning and position text", () => {
    const kb = buildKnowledge({
      cards: { "the-fool": { uprightTh: NEW_UPRIGHT } },
      spreads: {
        yes_no: {
          positions: yesNo.positions.map((p, i) => ({
            nameTh: i === 0 ? "สัญญาณแรก" : p.nameTh,
            meaningTh: p.meaningTh,
          })),
        },
      },
    });
    const { user } = interpretationPrompt({
      question: "ฉันจะได้งานนี้ไหม",
      analysis: null,
      spread: kb.resolveSpread("yes_no"),
      drawn: [
        { position: 1, positionKey: "signal", cardId: "the-fool", orientation: "upright" },
        { position: 2, positionKey: "support", cardId: "the-sun", orientation: "upright" },
        { position: 3, positionKey: "against", cardId: "the-moon", orientation: "reversed" },
      ],
      todayIso: "2026-11-18",
      cardOf: kb.requireCard,
      kbVersion: kb.version,
    });
    expect(user).toContain(NEW_UPRIGHT);
    expect(user).not.toContain(fool.uprightTh);
    expect(user).toContain("สัญญาณแรก");
    expect(user).toContain(kb.version);
  });

  it("question analysis only offers the spreads it is given", () => {
    const offered = SPREADS.filter((s) => s.id !== "celtic_cross");
    const system = questionAnalysisSystem(offered);
    expect(system).toContain('"yes_no"');
    expect(system).not.toContain('"celtic_cross": ');
  });
});
