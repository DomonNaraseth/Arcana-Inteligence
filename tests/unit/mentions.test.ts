import { describe, expect, it } from "vitest";
import { splitCardMentions } from "@/lib/tarot/mentions";

const cards = [
  { id: "the-world", name: "The World", nameTh: "โลก" },
  { id: "three-of-pentacles", name: "Three of Pentacles", nameTh: "3 เหรียญ" },
  { id: "queen-of-pentacles", name: "Queen of Pentacles", nameTh: "ราชินี เหรียญ" },
];

const marked = (text: string) =>
  splitCardMentions(text, cards)
    .filter((s) => s.cardId)
    .map((s) => `${s.cardId}:${s.text}`);

describe("splitCardMentions", () => {
  it("marks English names with or without 'The', in any case", () => {
    expect(marked("ไพ่ The World กลับหัว และ world ตั้งตรง")).toEqual(["the-world:The World", "the-world:world"]);
  });

  it("marks Thai names only after ไพ่, so everyday words stay plain", () => {
    expect(marked("ไพ่โลกบอกว่า ในโลกของการทำงาน")).toEqual(["the-world:ไพ่โลก"]);
    expect(marked("ไพ่ ราชินีเหรียญ")).toEqual(["queen-of-pentacles:ไพ่ ราชินีเหรียญ"]);
    expect(marked("ไพ่ราชินี เหรียญ")).toEqual(["queen-of-pentacles:ไพ่ราชินี เหรียญ"]);
  });

  it("keeps every character, in order", () => {
    const text = "Three of Pentacles กลับหัวชี้ว่า… ส่วน The World";
    expect(splitCardMentions(text, cards).map((s) => s.text).join("")).toBe(text);
  });

  it("returns the text whole when nothing matches or no cards are given", () => {
    expect(splitCardMentions("ไม่มีชื่อไพ่", cards)).toEqual([{ text: "ไม่มีชื่อไพ่" }]);
    expect(splitCardMentions("The World", [])).toEqual([{ text: "The World" }]);
  });
});
