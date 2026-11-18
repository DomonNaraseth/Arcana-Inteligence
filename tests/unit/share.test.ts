import { describe, expect, it } from "vitest";
import {
  bangkokDay,
  breakableThai,
  clipThai,
  parseSharedDaily,
  shareImageUrl,
  sharePageUrl,
  thaiDayLabel,
} from "@/lib/share";
import { DECK } from "@/lib/tarot/deck";
import { trackedPath } from "@/lib/tracking";

const known = (id: string) => DECK.some((c) => c.id === id);
const now = new Date("2026-11-18T10:00:00+07:00");

describe("shared daily card links", () => {
  it("accepts a real card, orientation and a day up to today", () => {
    expect(parseSharedDaily({ c: "the-star", o: "reversed", d: "2026-11-18" }, known, now)).toEqual({
      cardId: "the-star",
      orientation: "reversed",
      day: "2026-11-18",
    });
    expect(parseSharedDaily({ c: "the-star", o: "upright", d: "2026-01-02" }, known, now)).not.toBeNull();
  });

  it("refuses unknown cards, bad orientations, impossible, future and very old days", () => {
    expect(parseSharedDaily({ c: "not-a-card", o: "upright", d: "2026-11-18" }, known, now)).toBeNull();
    expect(parseSharedDaily({ c: "the-star", o: "sideways", d: "2026-11-18" }, known, now)).toBeNull();
    expect(parseSharedDaily({ c: "the-star", o: "upright", d: "2026-02-30" }, known, now)).toBeNull();
    expect(parseSharedDaily({ c: "the-star", o: "upright", d: "2026-11-19" }, known, now)).toBeNull();
    expect(parseSharedDaily({ c: "the-star", o: "upright", d: "2024-01-01" }, known, now)).toBeNull();
    expect(parseSharedDaily({ c: "The Star", o: "upright", d: "2026-11-18" }, known, now)).toBeNull();
    expect(parseSharedDaily({}, known, now)).toBeNull();
  });

  it("uses the Bangkok calendar day", () => {
    // 23:30 UTC on the 17th is already the 18th in Bangkok
    expect(bangkokDay(new Date("2026-11-17T23:30:00Z"))).toBe("2026-11-18");
    expect(thaiDayLabel("2026-11-18")).toContain("2569");
  });

  it("tags shared links by channel and carries nothing personal", () => {
    const s = { cardId: "the-star", orientation: "upright" as const, day: "2026-11-18" };
    const line = new URL(sharePageUrl("https://example.test", s, "line"));
    expect(line.pathname).toBe("/share/daily");
    expect(Object.fromEntries(line.searchParams)).toEqual({
      c: "the-star",
      o: "upright",
      d: "2026-11-18",
      utm_source: "line",
      utm_medium: "share",
      utm_campaign: "daily-card",
    });
    expect(new URL(sharePageUrl("https://example.test", s, "copy")).searchParams.get("utm_source")).toBe("share");
    expect(shareImageUrl("", s, "og")).toBe("/share/daily/image?c=the-star&o=upright&d=2026-11-18&format=og");
    expect(trackedPath("/share/daily")).toBe("/share/daily");
  });
});

describe("Thai text for generated images", () => {
  it("adds break opportunities between words without changing the visible text", () => {
    const text = "การยืนหยัดรักษาจุดยืนท่ามกลางแรงกดดัน";
    const out = breakableThai(text);
    expect(out.replace(/​/g, "")).toBe(text);
    expect(out.split("​").length).toBeGreaterThan(3);
  });

  it("shortens at a word boundary", () => {
    const text = "ถามคำถามให้มาก ฟังให้ครบ แล้วค่อยพูด ความจริงชอบคนช่างสังเกต";
    const out = clipThai(text, 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(text.startsWith(out.slice(0, -1).trimEnd())).toBe(true);
    expect(clipThai("สั้น", 20)).toBe("สั้น");
  });
});
