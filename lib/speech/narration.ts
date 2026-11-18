import type { Interpretation } from "../ai/schemas";
import type { DrawnCard, SpreadPosition, TarotCard } from "../tarot/types";

/**
 * What is read aloud, built from the same reading the page shows. Pure: the
 * browser's speech engine is driven by components/speech/narrator.ts.
 */

/** What kind of text was listened to; counted once per person per day (rule 13: nothing else). */
export const LISTEN_KINDS = ["reading", "daily", "chat"] as const;
export type ListenKind = (typeof LISTEN_KINDS)[number];

/** "reading:advice" → "reading", "chat:abc" → "chat", "daily" → "daily". */
export function listenKind(scope: string): ListenKind | null {
  const head = scope.split(":")[0];
  return (LISTEN_KINDS as readonly string[]).includes(head) ? (head as ListenKind) : null;
}

export interface NarrationPart {
  /** stable id, also used to highlight the part on the page */
  id: string;
  /** shown in the player while this part is read */
  title: string;
  text: string;
}

/** Turns on-screen typography into pauses a speech engine handles well. */
export function speechText(text: string): string {
  return text
    .replace(/[“”"«»]/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/…/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

const join = (parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");

/** A numbered list read as "หนึ่ง … สอง …" so the listener hears where items start. */
function list(items: string[]): string {
  return items.map((x, i) => `ข้อ ${i + 1}. ${x}`).join(" ");
}

export function cardTitle(position: number, positionName: string | undefined, card: TarotCard | undefined): string {
  return `ไพ่ใบที่ ${position}${positionName ? ` · ${positionName}` : ""}${card ? ` · ${card.nameTh}` : ""}`;
}

/** The parts of a reading, in the order they appear on the page. */
export function readingNarration(args: {
  data: Interpretation;
  drawn: DrawnCard[];
  positions: SpreadPosition[];
  cardOf: (id: string) => TarotCard;
}): NarrationPart[] {
  const { data } = args;
  const byPosition = new Map(args.drawn.map((d) => [d.position, d]));
  const parts: NarrationPart[] = [
    { id: "direct", title: "คำตอบโดยตรง", text: join([data.title, "คำตอบโดยตรง.", data.direct_answer]) },
  ];
  if (data.sub_answers?.length) {
    parts.push({
      id: "sub-answers",
      title: "คำตอบแยกตามคำถามของคุณ",
      text: join([
        "คำตอบแยกตามคำถามของคุณ.",
        data.sub_answers.map((a, i) => `ข้อ ${i + 1}. ${a.question}. ${a.answer}`).join(" "),
      ]),
    });
  }
  if (data.examples?.length) {
    parts.push({
      id: "examples",
      title: "ตัวอย่างที่ใกล้กับเรื่องของคุณ",
      text: join([
        "ตัวอย่างที่ใกล้กับเรื่องของคุณ.",
        data.examples
          .map((e, i) => `ตัวอย่างที่ ${i + 1}${e.dimension ? ` ด้าน${e.dimension}` : ""}. ${e.title}. ${e.example}`)
          .join(" "),
      ]),
    });
  }
  parts.push(
    { id: "overall", title: "ภาพรวมสถานการณ์", text: join(["ภาพรวมสถานการณ์.", data.overall_situation]) },
  );

  for (const c of data.cards) {
    const d = byPosition.get(c.position);
    const card = d ? args.cardOf(d.cardId) : undefined;
    const pos = args.positions[c.position - 1];
    parts.push({
      id: `card-${c.position}`,
      title: cardTitle(c.position, pos?.nameTh, card),
      text: join([
        `ไพ่ใบที่ ${c.position}${pos ? ` ตำแหน่ง${pos.nameTh}` : ""}.`,
        card ? `ไพ่${card.nameTh} ${d?.orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"}.` : null,
        c.headline,
        c.interpretation,
      ]),
    });
  }

  parts.push(
    {
      id: "relationships",
      title: "ความสัมพันธ์ระหว่างไพ่",
      text: join(["ความสัมพันธ์ระหว่างไพ่.", data.card_relationships, "พลังงานโดยรวม.", data.energy_analysis]),
    },
    { id: "hidden", title: "สิ่งที่ซ่อนอยู่", text: join(["สิ่งที่ซ่อนอยู่.", data.hidden_factors]) },
    { id: "opportunities", title: "โอกาส", text: join(["โอกาส.", list(data.opportunities)]) },
    { id: "obstacles", title: "อุปสรรค", text: join(["อุปสรรค.", list(data.obstacles)]) },
    { id: "future", title: "แนวโน้มข้างหน้า", text: join(["แนวโน้มข้างหน้า.", data.future_direction]) },
    { id: "advice", title: "คำแนะนำ", text: join(["คำแนะนำ.", list(data.advice)]) },
    { id: "cautions", title: "สิ่งที่ควรระวัง", text: join(["สิ่งที่ควรระวัง.", list(data.cautions)]) },
  );

  if (data.timeline && data.timeline.length > 0) {
    parts.push({
      id: "timeline",
      title: "แนวโน้มตามช่วงเวลา",
      text: join([
        "แนวโน้มตามช่วงเวลา.",
        data.timeline.map((t) => `${t.period}. ${t.outlook}`).join(" "),
        "ช่วงเวลาเป็นแนวโน้มเชิงสัญลักษณ์ ไม่ใช่การยืนยันว่าเหตุการณ์จะเกิดในช่วงนั้นแน่นอน.",
      ]),
    });
  }
  if (data.alternative_scenarios) {
    parts.push({
      id: "scenarios",
      title: "ถ้าเลือกทำ หรือเลือกรอ",
      text: join([
        "ถ้าเลือกทำ หรือเลือกรอ.",
        "หากลงมือ.",
        data.alternative_scenarios.if_act,
        "หากรอดูก่อน.",
        data.alternative_scenarios.if_wait,
      ]),
    });
  }
  parts.push({ id: "conclusion", title: "บทสรุปจากไพ่", text: join(["บทสรุปจากไพ่.", data.conclusion]) });

  return parts.map((p) => ({ ...p, text: speechText(p.text) }));
}

/** The card of the day: its message when there is one, else the knowledge-base meaning on screen. */
export function dailyNarration(args: {
  card: Pick<TarotCard, "nameTh" | "uprightTh" | "reversedTh" | "adviceTh">;
  orientation: "upright" | "reversed";
  message: { theme: string; message: string; embrace: string; mind: string; reflection: string } | null;
}): NarrationPart {
  const reversed = args.orientation === "reversed";
  const intro = `ไพ่ประจำวันของคุณคือ ไพ่${args.card.nameTh} ${reversed ? "กลับหัว" : "ตั้งตรง"}.`;
  const m = args.message;
  const text = m
    ? join([intro, m.theme + ".", m.message, "เปิดรับวันนี้.", m.embrace, "ใส่ใจวันนี้.", m.mind, "คำถามชวนคิด.", m.reflection])
    : join([intro, reversed ? args.card.reversedTh : args.card.uprightTh, "ข้อคิดวันนี้.", args.card.adviceTh]);
  return { id: "daily", title: `ไพ่ประจำวัน · ${args.card.nameTh}`, text: speechText(text) };
}

/**
 * Splits text into pieces short enough for every speech engine: some stop
 * mid-sentence on long utterances. Cuts at sentence ends, then at spaces
 * (Thai separates phrases with spaces), then at word boundaries.
 */
export function speechChunks(text: string, max = 180): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const out: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  const add = (piece: string, sep: string) => {
    if (!current) {
      current = piece;
    } else if ((current + sep + piece).length <= max) {
      current += sep + piece;
    } else {
      push();
      current = piece;
    }
  };

  for (const sentence of clean.split(/(?<=[.!?。])\s+/)) {
    if (sentence.length <= max) {
      add(sentence, " ");
      continue;
    }
    for (const phrase of sentence.split(/\s+/)) {
      if (phrase.length <= max) {
        add(phrase, " ");
        continue;
      }
      // one unbroken run of Thai: fall back to word boundaries
      const words =
        typeof Intl.Segmenter === "function"
          ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(phrase), (s) => s.segment)
          : Array.from({ length: Math.ceil(phrase.length / max) }, (_, i) => phrase.slice(i * max, (i + 1) * max));
      for (const w of words) add(w, "");
    }
  }
  push();
  return out;
}
