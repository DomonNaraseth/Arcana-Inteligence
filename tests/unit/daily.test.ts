import { describe, expect, it } from "vitest";
import { dailyMessageSchema, verifyDailyMessage, type DailyMessage } from "@/lib/ai/daily";
import { DECK, requireCard } from "@/lib/tarot/deck";
import { drawDailyCard } from "@/lib/tarot/draw";

const message = (over: Partial<DailyMessage> = {}): DailyMessage => ({
  theme: "ก้าวแรกที่กล้าหาญ",
  message:
    "ไพ่ The Fool ตั้งตรงสะท้อนพลังของการเริ่มต้นใหม่ วันนี้มีแนวโน้มที่คุณจะได้ลองสิ่งที่ยังไม่คุ้นเคย เปิดใจกับความไม่รู้โดยไม่ต้องมีคำตอบครบทุกข้อ",
  embrace: "ลองลงมือกับสิ่งเล็ก ๆ ที่คุณอยากเริ่มมานาน",
  mind: "ระวังการตัดสินใจโดยไม่ดูพื้นที่รอบตัว",
  reflection: "ก้าวแรกแบบไหนที่คุณพร้อมจะลองในวันนี้?",
  ...over,
});

describe("daily card", () => {
  it("draws a real card with a valid orientation", () => {
    const ids = new Set(DECK.map((c) => c.id));
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const d = drawDailyCard();
      expect(ids.has(d.cardId)).toBe(true);
      expect(["upright", "reversed"]).toContain(d.orientation);
      seen.add(d.cardId);
    }
    // not stuck on one card
    expect(seen.size).toBeGreaterThan(40);
  });

  it("respects the reversal probability at its extremes", () => {
    for (let i = 0; i < 50; i++) {
      expect(drawDailyCard({ reversalProbability: 0 }).orientation).toBe("upright");
      expect(drawDailyCard({ reversalProbability: 1 }).orientation).toBe("reversed");
    }
  });

  it("accepts a well-formed message of the day and rejects a thin one", () => {
    expect(dailyMessageSchema.safeParse(message()).success).toBe(true);
    expect(dailyMessageSchema.safeParse(message({ message: "สั้นเกินไป" })).success).toBe(false);
    expect(dailyMessageSchema.safeParse({ theme: "x" }).success).toBe(false);
  });

  it("lets the message name only the card that was drawn", () => {
    const fool = requireCard("the-fool");
    expect(verifyDailyMessage(message(), fool, DECK)).toEqual([]);
    const issues = verifyDailyMessage(
      message({ message: message().message + " คล้ายกับพลังของ The Magician ที่ตามมา" }),
      fool,
      DECK,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("The Magician");
  });

  it("accepts a message about the drawn card when its name appears", () => {
    const ace = requireCard("ace-of-cups");
    expect(
      verifyDailyMessage(message({ message: message().message.replace("The Fool", "Ace of Cups") }), ace, DECK),
    ).toEqual([]);
  });
});
