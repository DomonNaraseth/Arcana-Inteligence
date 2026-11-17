import type { DrawnCard, Spread } from "../tarot/types";
import {
  AiNotConfiguredError,
  extractJson,
  generate,
  type ChatMessage,
  type GenerateResult,
} from "./provider";
import { heuristicAnalysis } from "./heuristics";
import {
  followUpSystem,
  interpretationPrompt,
  questionAnalysisSystem,
  type CardLookup,
} from "./prompts";
import {
  interpretationSchema,
  questionAnalysisSchema,
  type Interpretation,
  type QuestionAnalysis,
} from "./schemas";

export interface Usage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function usageOf(results: GenerateResult[]): Usage | null {
  if (!results.length) return null;
  return {
    provider: results[0].provider,
    model: results[0].model,
    inputTokens: results.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: results.reduce((s, r) => s + r.outputTokens, 0),
  };
}

// ── Question Intelligence ──────────────────────────────────────────────────
/**
 * @param spreads the spreads currently on offer (effective names and
 *   descriptions, disabled ones already removed) — the model may only
 *   recommend from this list.
 */
export async function analyzeQuestion(
  question: string,
  spreads: readonly Spread[],
): Promise<{ analysis: QuestionAnalysis; usage: Usage | null }> {
  try {
    const result = await generate({
      tier: "fast",
      maxTokens: 900,
      system: questionAnalysisSystem(spreads),
      messages: [{ role: "user", content: `คำถามของผู้ใช้:\n"""${question}"""` }],
    });
    const parsed = questionAnalysisSchema.safeParse(extractJson(result.text));
    if (parsed.success) {
      const analysis: QuestionAnalysis = { ...parsed.data, source: "ai" };
      if (!spreads.some((s) => s.id === analysis.recommended_spread)) {
        analysis.recommended_spread = heuristicAnalysis(question).recommended_spread;
      }
      return { analysis, usage: usageOf([result]) };
    }
    return { analysis: heuristicAnalysis(question), usage: usageOf([result]) };
  } catch (err) {
    if (!(err instanceof AiNotConfiguredError)) {
      console.error("[arcana] question analysis failed, using heuristic", err);
    }
    return { analysis: heuristicAnalysis(question), usage: null };
  }
}

// ── Interpretation + Quality Control ───────────────────────────────────────
export interface QualityReport {
  passed: boolean;
  attempts: number;
  issues: string[];
}

/** Code-level verification — never trusts the model's own self-report alone. */
function verifyInterpretation(
  data: Interpretation,
  drawn: DrawnCard[],
): string[] {
  const issues: string[] = [];
  const byPos = new Map(data.cards.map((c) => [c.position, c]));
  for (const d of drawn) {
    const got = byPos.get(d.position);
    if (!got) issues.push(`ขาดคำอ่านของไพ่ตำแหน่งที่ ${d.position} (${d.cardId})`);
    else if (got.card_id !== d.cardId) {
      issues.push(
        `ตำแหน่งที่ ${d.position} ต้องเป็นไพ่ ${d.cardId} แต่คำอ่านอ้าง ${got.card_id}`,
      );
    }
  }
  if (data.cards.length > drawn.length) {
    issues.push("คำอ่านมีไพ่เกินจากที่เปิดได้จริง");
  }
  const qc = data.quality_check;
  if (!qc.answered_question) issues.push("ยังไม่ได้ตอบคำถามต้นฉบับ");
  if (!qc.all_cards_used) issues.push("ยังใช้ไพ่ไม่ครบทุกใบ");
  if (!qc.positions_respected) issues.push("การตีความยังไม่สัมพันธ์กับตำแหน่ง");
  if (!qc.contradictions_addressed) issues.push("ยังมีความขัดแย้งที่ไม่ได้อธิบาย");
  if (!qc.no_overclaim) issues.push("มีการกล่าวอ้างเกินหลักฐานจากไพ่");
  return issues;
}

const MAX_ATTEMPTS = 2;

export async function interpretReading(args: {
  question: string;
  analysis: QuestionAnalysis | null;
  spread: Spread;
  drawn: DrawnCard[];
  cardOf: CardLookup;
  kbVersion: string;
  addendum?: string;
}): Promise<{ interpretation: Interpretation; usage: Usage; quality: QualityReport }> {
  const { system, user } = interpretationPrompt({
    ...args,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  // Thai is token-heavy: budget generously so the JSON is never cut mid-object
  const maxTokens = Math.min(24000, 9000 + args.drawn.length * 900);

  let messages: ChatMessage[] = [{ role: "user", content: user }];
  const results: GenerateResult[] = [];
  let lastIssues: string[] = [];
  let lastValid: Interpretation | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await generate({ tier: "deep", maxTokens, system, messages });
    results.push(result);

    if (result.truncated) {
      // a cut-off answer cannot be repaired — ask again, more concisely
      lastIssues = ["คำอ่านยาวเกินขีดจำกัดจนถูกตัดกลางคัน"];
      messages = [
        {
          role: "user",
          content: `${user}\n\nข้อกำหนดเพิ่มเติม: คำตอบรอบก่อนยาวเกินจนถูกตัด ให้เขียนกระชับลงราว 35% (แต่ละช่องสั้นลง) โดยยังคงครบทุกหัวข้อและไพ่ทุกใบ`,
        },
      ];
      continue;
    }

    let issues: string[];
    let candidate: Interpretation | null = null;
    try {
      const parsed = interpretationSchema.safeParse(extractJson(result.text));
      if (parsed.success) {
        candidate = parsed.data;
        issues = verifyInterpretation(candidate, args.drawn);
      } else {
        issues = parsed.error.issues
          .slice(0, 6)
          .map((i) => `โครงสร้าง JSON ไม่ถูกต้องที่ ${i.path.join(".")}: ${i.message}`);
      }
    } catch (e) {
      issues = [`ไม่สามารถอ่าน JSON ได้: ${(e as Error).message}`];
    }

    if (candidate && issues.length === 0) {
      return {
        interpretation: candidate,
        usage: usageOf(results)!,
        quality: { passed: true, attempts: attempt, issues: [] },
      };
    }
    if (candidate) lastValid = candidate;
    lastIssues = issues;

    messages.push({ role: "assistant", content: result.text });
    messages.push({
      role: "user",
      content: `คำอ่านยังไม่ผ่านการตรวจคุณภาพ:\n- ${issues.join("\n- ")}\n\nแก้ไขให้ครบทุกข้อ แล้วตอบใหม่เป็น JSON object เดียวตามโครงสร้างเดิมทั้งหมด`,
    });
  }

  // Structurally valid with only self-reported soft issues → deliver, flagged.
  if (lastValid && verifyCardsOnly(lastValid, args.drawn)) {
    return {
      interpretation: lastValid,
      usage: usageOf(results)!,
      quality: { passed: false, attempts: MAX_ATTEMPTS, issues: lastIssues },
    };
  }
  throw new InterpretationQualityError(lastIssues);
}

function verifyCardsOnly(data: Interpretation, drawn: DrawnCard[]): boolean {
  if (data.cards.length !== drawn.length) return false;
  const byPos = new Map(data.cards.map((c) => [c.position, c.card_id]));
  return drawn.every((d) => byPos.get(d.position) === d.cardId);
}

export class InterpretationQualityError extends Error {
  constructor(public issues: string[]) {
    super("Interpretation failed quality validation");
  }
}

// ── Follow-up conversation ─────────────────────────────────────────────────
export function summarizeInterpretation(i: Interpretation): string {
  return [
    `หัวเรื่อง: ${i.title}`,
    `แนวโน้ม: ${i.tendency}`,
    `คำตอบโดยตรง: ${i.direct_answer}`,
    `ภาพรวม: ${i.overall_situation}`,
    `ความสัมพันธ์ของไพ่: ${i.card_relationships}`,
    `ปัจจัยแฝง: ${i.hidden_factors}`,
    `โอกาส: ${i.opportunities.join(" / ")}`,
    `อุปสรรค: ${i.obstacles.join(" / ")}`,
    `แนวโน้มอนาคต: ${i.future_direction}`,
    `คำแนะนำ: ${i.advice.join(" / ")}`,
    `ข้อควรระวัง: ${i.cautions.join(" / ")}`,
    `บทสรุป: ${i.conclusion}`,
  ].join("\n");
}

export async function answerFollowUp(args: {
  question: string;
  analysis: QuestionAnalysis | null;
  spread: Spread;
  drawn: DrawnCard[];
  interpretation: Interpretation;
  history: ChatMessage[];
  message: string;
  cardOf: CardLookup;
  addendum?: string;
}): Promise<{ reply: string; usage: Usage }> {
  const system = followUpSystem({
    question: args.question,
    analysis: args.analysis,
    spread: args.spread,
    drawn: args.drawn,
    interpretationSummary: summarizeInterpretation(args.interpretation),
    cardOf: args.cardOf,
    addendum: args.addendum,
  });
  // keep the conversation window bounded to control token cost
  const history = args.history.slice(-12);
  const result = await generate({
    tier: "chat",
    maxTokens: 1500,
    system,
    messages: [...history, { role: "user", content: args.message }],
  });
  const reply = result.text.trim();
  if (!reply) throw new Error("Empty follow-up response");
  return { reply, usage: usageOf([result])! };
}
