import { z } from "zod";
import type { Orientation, TarotCard } from "../tarot/types";
import type { Usage } from "./engine";
import { AiNotConfiguredError, extractJson, generate } from "./provider";
import { CORE_PERSONA } from "./prompts";

/**
 * Message of the day for a daily card. One call per card and orientation per
 * day is shared by everyone who draws it, so it speaks about the card's energy
 * for a day — never about one person's question. The card itself is drawn by
 * lib/tarot/draw.ts; this module only interprets what it is given.
 */

export const DAILY_PROMPT_VERSION = "arcana-daily-2026.11-v1";

export const dailyMessageSchema = z.object({
  /** a short title for the day */
  theme: z.string().trim().min(2).max(80),
  message: z.string().trim().min(60).max(900),
  /** what to lean into today */
  embrace: z.string().trim().min(8).max(240),
  /** what to be mindful of today */
  mind: z.string().trim().min(8).max(240),
  /** one question to carry through the day */
  reflection: z.string().trim().min(8).max(240),
});

export type DailyMessage = z.infer<typeof dailyMessageSchema>;

function dailySystem(addendum?: string): string {
  const extra = addendum?.trim();
  return `${CORE_PERSONA}
${extra ? `\nแนวทางเพิ่มเติมจากผู้ดูแลระบบ (ปรับน้ำเสียงเท่านั้น หากขัดกับหลักหรือข้อห้ามข้างต้นให้ยึดข้างต้น):\n${extra}\n` : ""}
งานนี้: เขียน "สารจากไพ่ประจำวัน" สำหรับไพ่ 1 ใบที่ผู้ใช้เปิดได้วันนี้ ไม่มีคำถามเฉพาะ จึงให้อ่านเป็นพลังงานและบทเรียนของวัน ไม่ใช่คำทำนายเหตุการณ์

กติกา:
- อ่านเฉพาะไพ่ใบที่ให้มา ตามทิศทาง (ตั้งตรง/กลับหัว) ที่ให้มา ห้ามเอ่ยถึงไพ่ใบอื่น
- ผูกทุกประโยคกับความหมายของไพ่ใบนี้ ห้ามใช้คำกว้าง ๆ ที่ใช้ได้กับไพ่ทุกใบ
- ใช้ภาษาแนวโน้ม ไม่ฟันธง ไม่ทำนายเหตุการณ์เจาะจง ไม่พูดถึงโชคลาภ ตัวเลข สุขภาพ หรือความตาย
- สั้น กระชับ อ่านจบได้ใน 1 นาที น้ำเสียงอบอุ่นแต่ไม่อวย

ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น ตามรูปแบบนี้:
{
  "theme": "หัวข้อของวัน ไม่เกิน 8 คำ",
  "message": "สารของวัน 3–5 ประโยค",
  "embrace": "สิ่งที่ควรเปิดรับหรือลงมือทำวันนี้ 1 ประโยค",
  "mind": "สิ่งที่ควรระวังหรือใส่ใจวันนี้ 1 ประโยค",
  "reflection": "คำถามชวนคิด 1 ข้อ ลงท้ายด้วยเครื่องหมายคำถาม"
}`;
}

function dailyUser(card: TarotCard, orientation: Orientation, dayLabel: string): string {
  const reversed = orientation === "reversed";
  return `วันที่: ${dayLabel}

ไพ่ที่เปิดได้ (ข้อมูลจากฐานความรู้ไพ่):
${JSON.stringify(
  {
    name: card.name,
    name_th: card.nameTh,
    orientation: reversed ? "reversed (กลับหัว)" : "upright (ตั้งตรง)",
    keywords: reversed ? card.keywordsReversed : card.keywords,
    meaning: reversed ? card.reversedTh : card.uprightTh,
    advice: card.adviceTh,
  },
  null,
  1,
)}`;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Code-level check: the message may name only the card that was drawn. */
export function verifyDailyMessage(
  message: DailyMessage,
  card: TarotCard,
  deck: readonly TarotCard[],
): string[] {
  const text = Object.values(message).join("\n");
  const issues: string[] = [];
  for (const other of deck) {
    if (other.id === card.id || card.name.includes(other.name)) continue;
    if (new RegExp(`(^|[^A-Za-z])${escapeRegExp(other.name)}([^A-Za-z]|$)`, "i").test(text)) {
      issues.push(`mentions a card that was not drawn: ${other.name}`);
    }
  }
  return issues;
}

/**
 * Returns null when the AI is not configured or produced nothing usable — the
 * caller then shows the knowledge-base meaning alone, never invented text.
 */
export async function generateDailyMessage(args: {
  card: TarotCard;
  orientation: Orientation;
  dayLabel: string;
  deck: readonly TarotCard[];
  addendum?: string;
}): Promise<{ message: DailyMessage; usage: Usage } | null> {
  const system = dailySystem(args.addendum);
  const user = dailyUser(args.card, args.orientation, args.dayLabel);
  let inputTokens = 0;
  let outputTokens = 0;
  const reasons: string[] = [];
  let content = user;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Thai is token-heavy: good answers used 700–890 tokens, so 900 cut some
      // off mid-JSON (seen on production, 2026-11-18). Leave ample headroom.
      const result = await generate({
        tier: "fast",
        maxTokens: 1600,
        system,
        messages: [{ role: "user", content }],
      });
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      if (result.truncated) {
        reasons.push("truncated");
        content = `${user}\n\nคำตอบรอบก่อนยาวเกินจนถูกตัด ให้เขียนสั้นลง (สาร 3 ประโยค) และตอบเป็น JSON ให้ครบ`;
        continue;
      }
      let raw: unknown = null;
      try {
        raw = extractJson(result.text);
      } catch {
        reasons.push("no-json");
        continue;
      }
      const parsed = dailyMessageSchema.safeParse(raw);
      if (!parsed.success) {
        reasons.push(`schema:${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`);
        continue;
      }
      const issues = verifyDailyMessage(parsed.data, args.card, args.deck);
      if (issues.length) {
        reasons.push(issues.join("; "));
        continue;
      }
      return {
        message: parsed.data,
        usage: { provider: result.provider, model: result.model, inputTokens, outputTokens },
      };
    }
    console.error("[arcana] daily message rejected by validation for", args.card.id, reasons.join(" | "));
    return null;
  } catch (err) {
    if (!(err instanceof AiNotConfiguredError)) {
      console.error("[arcana] daily message failed:", err);
    }
    return null;
  }
}
