import { extractJson, generate, type ChatMessage, type GenerateResult } from "../ai/provider";
import { cardTextsPrompt, conceptPrompt } from "./prompts";
import {
  cardTextsSchema,
  conceptSchema,
  type OracleBrief,
  type OracleCard,
  type OracleCardText,
  type OracleConcept,
  type OracleConceptDraft,
} from "./schemas";

/** The AI answered but not in a usable shape twice; nothing was saved. */
export class OracleAiError extends Error {
  constructor(public issues: string[]) {
    super(`oracle AI output rejected: ${issues.join(" | ")}`);
  }
}

async function askJson<T>(args: {
  system: string;
  user: string;
  maxTokens: number;
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; issues: string[] };
}): Promise<{ value: T; results: GenerateResult[] }> {
  const messages: ChatMessage[] = [{ role: "user", content: args.user }];
  const results: GenerateResult[] = [];
  let issues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await generate({ tier: "deep", maxTokens: args.maxTokens, system: args.system, messages });
    results.push(r);
    if (r.truncated) {
      issues = ["คำตอบยาวเกินจนถูกตัด"];
      messages.splice(1);
      messages[0] = { role: "user", content: `${args.user}\n\nคำตอบรอบก่อนยาวเกินจนถูกตัด ให้เขียนกระชับลง โดยยังครบทุกช่อง` };
      continue;
    }
    try {
      const parsed = args.parse(extractJson(r.text));
      if (parsed.ok) return { value: parsed.value, results };
      issues = parsed.issues;
    } catch (e) {
      issues = [`อ่าน JSON ไม่ได้: ${(e as Error).message}`];
    }
    messages.push({ role: "assistant", content: r.text });
    messages.push({
      role: "user",
      content: `ยังไม่ผ่านการตรวจ:\n- ${issues.join("\n- ")}\nแก้ให้ครบ แล้วตอบใหม่เป็น JSON object เดียวตามโครงสร้างเดิม`,
    });
  }
  throw new OracleAiError(issues);
}

/** Checks what Zod cannot: every card number 1..N exactly once, names unique. */
export function checkConcept(draft: OracleConceptDraft, cardCount: number): string[] {
  const issues: string[] = [];
  const numbers = draft.cards.map((c) => c.number).sort((a, b) => a - b);
  const expected = Array.from({ length: cardCount }, (_, i) => i + 1);
  if (numbers.join(",") !== expected.join(",")) {
    issues.push(`cards ต้องมี number 1 ถึง ${cardCount} ครบและไม่ซ้ำ (ได้ ${draft.cards.length} ใบ)`);
  }
  const names = new Set(draft.cards.map((c) => c.name.trim()));
  if (names.size !== draft.cards.length) issues.push("ชื่อไพ่ซ้ำกัน ต้องไม่ซ้ำ");
  return issues;
}

export async function generateConcept(brief: OracleBrief) {
  const { system, user } = conceptPrompt(brief);
  // ~120 tokens per card in the list, plus the concept itself (Thai is token-heavy)
  const maxTokens = Math.min(20000, 5000 + brief.card_count * 160);
  return askJson<OracleConceptDraft>({
    system,
    user,
    maxTokens,
    parse: (raw) => {
      const p = conceptSchema.safeParse(raw);
      if (!p.success) {
        return { ok: false, issues: p.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`) };
      }
      const issues = checkConcept(p.data, brief.card_count);
      return issues.length ? { ok: false, issues } : { ok: true, value: p.data };
    },
  });
}

/** Writes the full text of up to 8 cards at a time, in the context of the whole deck. */
export async function generateCardTexts(args: {
  title: string;
  title_en: string;
  concept: Partial<OracleConcept>;
  allCards: Pick<OracleCard, "number" | "name" | "name_en" | "essence">[];
  numbers: number[];
}) {
  const { system, user } = cardTextsPrompt(args);
  const wanted = [...args.numbers].sort((a, b) => a - b).join(",");
  return askJson<OracleCardText[]>({
    system,
    user,
    maxTokens: Math.min(16000, 2500 + args.numbers.length * 1100),
    parse: (raw) => {
      const p = cardTextsSchema.safeParse(raw);
      if (!p.success) {
        return { ok: false, issues: p.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`) };
      }
      const got = p.data.cards.map((c) => c.number).sort((a, b) => a - b).join(",");
      if (got !== wanted) return { ok: false, issues: [`ต้องเขียนไพ่หมายเลข ${wanted} ครบพอดี (ได้ ${got})`] };
      return { ok: true, value: p.data.cards };
    },
  });
}
