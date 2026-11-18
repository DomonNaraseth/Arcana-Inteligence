import { describe, expect, it } from "vitest";
import { citesDrawnCard, verifyInterpretation } from "@/lib/ai/engine";
import { ANSWER_SHAPE, interpretationPrompt } from "@/lib/ai/prompts";
import { INTENTS, interpretationSchema, type Interpretation, type QuestionAnalysis } from "@/lib/ai/schemas";
import { DECK } from "@/lib/tarot/deck";
import { SPREADS } from "@/lib/tarot/spreads";
import type { DrawnCard } from "@/lib/tarot/types";

const cardOf = (id: string) => DECK.find((c) => c.id === id)!;
const first = DECK[0];
const second = DECK[1];

const drawn: DrawnCard[] = [
  { position: 1, positionKey: "past", cardId: first.id, orientation: "upright" },
  { position: 2, positionKey: "present", cardId: second.id, orientation: "reversed" },
];

function reading(over: Partial<Interpretation> = {}): Interpretation {
  return {
    title: "สัมภาษณ์งานรอบสอง",
    tendency: "ค่อนข้างดี มีเงื่อนไข",
    direct_answer: `โน้มไปทางใช่ ไพ่ ${first.name} บอกถึงการเริ่มต้นใหม่ในงานที่คุณสมัคร`,
    overall_situation: "ภาพรวม",
    cards: [
      { position: 1, card_id: first.id, headline: "เริ่มใหม่", interpretation: "ความหมาย" },
      { position: 2, card_id: second.id, headline: "ติดขัด", interpretation: "ความหมาย" },
    ],
    card_relationships: "ส่งต่อกัน",
    energy_analysis: "พลังลม",
    hidden_factors: "ซ่อน",
    opportunities: ["โอกาส"],
    obstacles: ["อุปสรรค"],
    future_direction: "ข้างหน้า",
    advice: ["เตรียมตัวอย่าง"],
    cautions: ["อย่ารีบ"],
    timeline: null,
    alternative_scenarios: null,
    conclusion: "สรุป",
    examples: [
      { title: "ตอนสัมภาษณ์", example: "อาจถูกถามถึงโปรเจกต์ที่คุณเล่า", positions: [1] },
      { title: "หลังสัมภาษณ์", example: "อาจได้คำตอบช้ากว่าที่คิด", positions: [2] },
    ],
    follow_up_questions: ["ถามต่อ"],
    quality_check: {
      answered_question: true,
      all_cards_used: true,
      positions_respected: true,
      contradictions_addressed: true,
      no_overclaim: true,
    },
    ...over,
  };
}

const check = (data: Interpretation, intent: QuestionAnalysis["intent"] | null = null) =>
  verifyInterpretation(data, drawn, { cardOf, intent });

describe("verifyInterpretation", () => {
  it("passes a reading that answers in shape and rests every example on a drawn card", () => {
    expect(check(reading(), "yes_no")).toEqual([]);
  });

  it("requires examples", () => {
    expect(check(reading({ examples: [] })).join()).toContain("examples");
    expect(check(reading({ examples: undefined })).join()).toContain("examples");
  });

  it("rejects an example that cites a card that was never drawn", () => {
    const issues = check(reading({ examples: [{ title: "x", example: "y", positions: [1, 7] }] }));
    expect(issues).toEqual(["ตัวอย่างข้อ 1 อ้างไพ่ตำแหน่ง 7 ซึ่งไม่ได้เปิด"]);
  });

  it("requires the direct answer to name a drawn card", () => {
    const issues = check(reading({ direct_answer: "โน้มไปทางใช่ เพราะพลังงานดี" }));
    expect(issues).toContain("คำตอบโดยตรงยังไม่ได้เอ่ยชื่อไพ่ที่รองรับ");
  });

  it("asks a yes/no question to open with a lean", () => {
    const answer = `ไพ่ ${first.nameTh} บอกว่าน่าจะได้`;
    expect(check(reading({ direct_answer: answer }), "yes_no").join()).toContain("โน้มไปทางใช่");
    expect(check(reading({ direct_answer: answer }), "situation")).toEqual([]);
  });

  it("asks a timing question for a timeline", () => {
    expect(check(reading(), "timing")).toContain("คำถามเรื่องจังหวะเวลา ต้องมี timeline");
    expect(check(reading({ timeline: [{ period: "1-3 เดือน", outlook: "เริ่มชัด" }] }), "timing")).toEqual([]);
  });

  it("still catches a card that does not match the draw", () => {
    const cards = [reading().cards[0], { ...reading().cards[1], card_id: DECK[5].id }];
    expect(check(reading({ cards })).join()).toContain(`ตำแหน่งที่ 2 ต้องเป็นไพ่ ${second.id}`);
  });
});

describe("citesDrawnCard", () => {
  it("accepts the English name with or without 'The', any case, or the Thai name", () => {
    const name = first.name.replace(/^The /, "");
    expect(citesDrawnCard(`ไพ่ ${name.toUpperCase()} ชี้ว่า`, drawn, cardOf)).toBe(true);
    expect(citesDrawnCard(`ไพ่${second.nameTh}กลับหัว`, drawn, cardOf)).toBe(true);
    expect(citesDrawnCard("ไพ่ชุดนี้ดูดี", drawn, cardOf)).toBe(false);
  });
});

describe("answer shape", () => {
  it("has guidance for every intent", () => {
    for (const intent of INTENTS) expect(ANSWER_SHAPE[intent].length).toBeGreaterThan(20);
  });

  it("goes to the model with the question it belongs to", () => {
    const spread = SPREADS[0];
    const { user, system } = interpretationPrompt({
      question: "จะได้งานที่สัมภาษณ์ไปไหม",
      analysis: {
        category: "career",
        intent: "yes_no",
        time_horizon: "1 เดือน",
        dimensions: ["งาน"],
        understanding: "คุณต้องการรู้ว่าจะได้งานไหม",
        ambiguity_level: "low",
        clarification_question: null,
        recommended_spread: spread.id,
        spread_reason: "",
        sensitivity: "none",
        source: "ai",
      },
      spread,
      drawn: drawn.slice(0, 1),
      todayIso: "2026-11-19",
      cardOf,
      kbVersion: "test",
    });
    expect(user).toContain(ANSWER_SHAPE.yes_no);
    expect(system).toContain('"examples"');
  });

  it("requires examples from every new answer", () => {
    const { examples: _drop, ...rest } = reading();
    expect(interpretationSchema.safeParse(rest).success).toBe(false);
    expect(interpretationSchema.safeParse(reading()).success).toBe(true);
  });
});
