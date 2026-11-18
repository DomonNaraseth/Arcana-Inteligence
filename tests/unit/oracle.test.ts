import { describe, expect, it } from "vitest";
import { checkConcept } from "@/lib/oracle/ai";
import { drawOracleCard } from "@/lib/oracle/draw";
import { conceptPrompt, imagePrompt, styleText } from "@/lib/oracle/prompts";
import { briefSchema, cardTextsSchema, conceptSchema, type OracleConceptDraft } from "@/lib/oracle/schemas";

const style = {
  art_direction: "soft watercolor illustration with delicate ink outlines",
  palette: [
    { name: "ทอง", hex: "#C6A15B" },
    { name: "กรมท่า", hex: "#17263C" },
    { name: "งาช้าง", hex: "#F0E9DA" },
  ],
  motifs: ["moon phases", "lotus"],
  composition: "single central figure, soft vignette",
  cover_design: "a crescent moon over a lotus pond",
  back_design: "a symmetrical lotus mandala",
};

function draft(n: number): OracleConceptDraft {
  return {
    title: "จันทร์ในใจ",
    title_en: "Moon Within",
    tagline: "สารจากดวงจันทร์",
    story: "เรื่องราวของสำรับที่ยาวพอสำหรับการตรวจ",
    how_to_use: "สับไพ่ ตั้งใจ แล้วจั่วหนึ่งใบ อ่านอย่างเปิดใจ",
    themes: ["พัก", "เริ่มใหม่"],
    audience: "คนทำงาน",
    tone: "อบอุ่น",
    guidebook_intro: "บทนำคู่มือไพ่ที่ยาวพอสำหรับการตรวจ",
    style,
    cards: Array.from({ length: n }, (_, i) => ({ number: i + 1, name: `ไพ่ ${i + 1}`, name_en: `Card ${i + 1}`, essence: "แก่น" })),
  };
}

describe("oracle concept", () => {
  it("accepts a full concept and checks every card number exactly once", () => {
    expect(conceptSchema.safeParse(draft(8)).success).toBe(true);
    expect(checkConcept(draft(8), 8)).toEqual([]);
    expect(checkConcept(draft(7), 8)[0]).toContain("1 ถึง 8");
  });

  it("rejects duplicate card names", () => {
    const d = draft(8);
    d.cards[1].name = d.cards[0].name;
    expect(checkConcept(d, 8)).toContain("ชื่อไพ่ซ้ำกัน ต้องไม่ซ้ำ");
  });

  it("asks the AI for exactly the number of cards in the brief", () => {
    const brief = briefSchema.parse({ idea: "สำรับไพ่จากดวงจันทร์และฤดูกาล", card_count: 36, art_style: "watercolor" });
    const { system, user } = conceptPrompt(brief);
    expect(system).toContain("ครบ 36 ใบ");
    expect(user).toContain(styleText(brief));
    expect(system).toContain("ห้ามรับประกันผล");
  });

  it("uses the owner's own words for a custom style", () => {
    expect(styleText({ art_style: "custom", custom_style: "neon cyberpunk temple" })).toBe("neon cyberpunk temple");
  });
});

describe("oracle card texts", () => {
  it("needs the English scene the image model reads", () => {
    const ok = {
      cards: [
        {
          number: 1,
          keywords: ["พัก", "ฟังใจ"],
          meaning: "ความหมายที่ยาวพอสำหรับการตรวจของสคีมา",
          message: "สารถึงคุณที่ยาวพอสำหรับการตรวจของสคีมา",
          affirmation: "ฉันพักได้",
          reflection: "วันนี้ใจคุณต้องการอะไร",
          visual: "a figure resting under a crescent moon by a lotus pond",
        },
      ],
    };
    expect(cardTextsSchema.safeParse(ok).success).toBe(true);
    expect(cardTextsSchema.safeParse({ cards: [{ ...ok.cards[0], visual: "" }] }).success).toBe(false);
  });
});

describe("oracle image prompt", () => {
  const concept = { style };

  it("never asks for lettering, never names the card or deck, and keeps the deck style", () => {
    const p = imagePrompt({
      title_en: "Moon Within",
      concept,
      target: "card",
      card: { name_en: "Rain That Cleanses", visual: "a figure resting under 'Rain'", essence: "" },
    });
    expect(p).toContain("no text, letters, numbers");
    expect(p).not.toContain("Rain That Cleanses");
    expect(p).not.toContain("Moon Within");
    expect(p).not.toMatch(/['"“”]Rain/);
    expect(p).toContain("#C6A15B");
    expect(p).toContain("moon phases");
    expect(p).toContain("a figure resting");
  });

  it("asks for a symmetrical card back and a cover with the deck's own descriptions", () => {
    expect(imagePrompt({ title_en: "Moon Within", concept, target: "back" })).toContain("symmetrical lotus mandala");
    expect(imagePrompt({ title_en: "Moon Within", concept, target: "cover" })).toContain("crescent moon over a lotus pond");
  });
});

describe("drawOracleCard", () => {
  it("always returns a card of the deck and reaches every card", () => {
    const deck = [1, 2, 3, 4, 5];
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const c = drawOracleCard(deck);
      expect(deck).toContain(c);
      seen.add(c);
    }
    expect(seen.size).toBe(deck.length);
  });

  it("refuses an empty deck", () => {
    expect(() => drawOracleCard([])).toThrow();
  });
});
