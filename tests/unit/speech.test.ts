import { describe, expect, it } from "vitest";
import type { Interpretation } from "@/lib/ai/schemas";
import { dailyNarration, readingNarration, speechChunks, speechText } from "@/lib/speech/narration";
import { DECK } from "@/lib/tarot/deck";
import type { DrawnCard, SpreadPosition } from "@/lib/tarot/types";

const cardOf = (id: string) => DECK.find((c) => c.id === id)!;

const positions: SpreadPosition[] = [
  { key: "past", nameTh: "อดีต", nameEn: "Past", meaningTh: "" },
  { key: "present", nameTh: "ปัจจุบัน", nameEn: "Present", meaningTh: "" },
];
const drawn: DrawnCard[] = [
  { position: 1, positionKey: "past", cardId: DECK[0].id, orientation: "upright" },
  { position: 2, positionKey: "present", cardId: DECK[1].id, orientation: "reversed" },
];

function interpretation(over: Partial<Interpretation> = {}): Interpretation {
  return {
    title: "ทางแยกของหัวใจ",
    tendency: "ค่อนข้างดี",
    direct_answer: "มีแนวโน้มไปได้ดี — หากสื่อสารตรงไปตรงมา",
    overall_situation: "สถานการณ์โดยรวม",
    cards: [
      { position: 1, card_id: DECK[0].id, headline: "จุดเริ่มต้น", interpretation: "ความหมายใบแรก" },
      { position: 2, card_id: DECK[1].id, headline: "พลังที่ติดขัด", interpretation: "ความหมายใบที่สอง" },
    ],
    card_relationships: "ไพ่ส่งต่อกัน",
    energy_analysis: "พลังไฟเด่น",
    hidden_factors: "สิ่งที่ซ่อน",
    opportunities: ["โอกาสหนึ่ง", "โอกาสสอง"],
    obstacles: ["อุปสรรคหนึ่ง"],
    future_direction: "ข้างหน้า",
    advice: ["คุยตรง ๆ"],
    cautions: ["อย่ารีบ"],
    timeline: null,
    alternative_scenarios: null,
    conclusion: "สรุป",
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

describe("readingNarration", () => {
  it("follows the page order and starts with the direct answer", () => {
    const parts = readingNarration({ data: interpretation(), drawn, positions, cardOf });
    expect(parts.map((p) => p.id)).toEqual([
      "direct",
      "overall",
      "card-1",
      "card-2",
      "relationships",
      "hidden",
      "opportunities",
      "obstacles",
      "future",
      "advice",
      "cautions",
      "conclusion",
    ]);
    expect(parts[0].text).toContain("มีแนวโน้มไปได้ดี, หากสื่อสารตรงไปตรงมา");
  });

  it("reads each card with its position, the drawn card and orientation", () => {
    const parts = readingNarration({ data: interpretation(), drawn, positions, cardOf });
    const second = parts.find((p) => p.id === "card-2")!;
    expect(second.text).toContain("ตำแหน่งปัจจุบัน");
    expect(second.text).toContain(`ไพ่${DECK[1].nameTh} กลับหัว`);
    expect(second.title).toContain("ปัจจุบัน");
  });

  it("numbers list items so the listener hears where each starts", () => {
    const parts = readingNarration({ data: interpretation(), drawn, positions, cardOf });
    expect(parts.find((p) => p.id === "opportunities")!.text).toBe("โอกาส. ข้อ 1. โอกาสหนึ่ง ข้อ 2. โอกาสสอง");
  });

  it("adds timeline and scenarios only when the reading has them", () => {
    const parts = readingNarration({
      data: interpretation({
        timeline: [{ period: "1 เดือน", outlook: "เริ่มชัด" }],
        alternative_scenarios: { if_act: "ลงมือ", if_wait: "รอ" },
      }),
      drawn,
      positions,
      cardOf,
    });
    const ids = parts.map((p) => p.id);
    expect(ids.slice(-3)).toEqual(["timeline", "scenarios", "conclusion"]);
    expect(parts.find((p) => p.id === "timeline")!.text).toContain("ไม่ใช่การยืนยัน");
  });
});

describe("dailyNarration", () => {
  const card = DECK[0];
  it("reads the message of the day when there is one", () => {
    const part = dailyNarration({
      card,
      orientation: "upright",
      message: { theme: "เริ่มใหม่", message: "วันนี้", embrace: "รับ", mind: "ระวัง", reflection: "ถามใจ" },
    });
    expect(part.text).toMatch(/^ไพ่ประจำวันของคุณคือ/);
    expect(part.text).toContain("คำถามชวนคิด. ถามใจ");
  });
  it("falls back to the knowledge-base meaning shown on screen", () => {
    const part = dailyNarration({ card, orientation: "reversed", message: null });
    expect(part.text).toContain(speechText(card.reversedTh));
    expect(part.text).toContain(speechText(card.adviceTh));
  });
});

describe("speechChunks", () => {
  it("keeps short text whole", () => {
    expect(speechChunks("สั้น ๆ")).toEqual(["สั้น ๆ"]);
    expect(speechChunks("  ")).toEqual([]);
  });

  it("never exceeds the limit and loses no text", () => {
    const text = Array.from({ length: 40 }, (_, i) => `ประโยคที่ ${i} มีความหมายลึกซึ้ง.`).join(" ");
    const chunks = speechChunks(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join(" ")).toBe(text);
  });

  it("splits an unbroken Thai run at word boundaries", () => {
    const run = "ความรักครั้งนี้ต้องการความเข้าใจและความอดทน".repeat(10);
    const chunks = speechChunks(run, 60);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(60);
    expect(chunks.join("")).toBe(run);
  });
});

describe("speechText", () => {
  it("turns typography into pauses", () => {
    expect(speechText("“ไพ่” — ตั้งตรง · กลับหัว…")).toBe("ไพ่, ตั้งตรง, กลับหัว.");
  });
});
