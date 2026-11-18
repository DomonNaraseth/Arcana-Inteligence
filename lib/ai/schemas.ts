import { z } from "zod";

export const PROMPT_VERSION = "arcana-2026.11-v2";

export const CATEGORIES = [
  "general", "love", "relationship", "career", "finance", "business", "family",
  "growth", "spiritual", "decision", "future", "hidden", "yes_no", "conflict",
  "opportunity", "health",
] as const;

export const INTENTS = [
  "situation", "feelings", "event", "decision", "cause", "opportunity",
  "timing", "advice", "risk", "relationship", "yes_no", "forecast",
] as const;

export const CATEGORY_TH: Record<string, string> = {
  general: "ภาพรวมชีวิต", love: "ความรัก", relationship: "ความสัมพันธ์",
  career: "การงาน", finance: "การเงิน", business: "ธุรกิจ", family: "ครอบครัว",
  growth: "การพัฒนาตนเอง", spiritual: "จิตวิญญาณ", decision: "การตัดสินใจ",
  future: "แนวโน้มอนาคต", hidden: "ปัจจัยแฝง", yes_no: "ใช่หรือไม่",
  conflict: "ความขัดแย้ง", opportunity: "โอกาส", health: "สุขภาพ",
};

export const INTENT_TH: Record<string, string> = {
  situation: "เข้าใจสถานการณ์", feelings: "เข้าใจความรู้สึก", event: "สิ่งที่จะเกิดขึ้น",
  decision: "ช่วยตัดสินใจ", cause: "หาสาเหตุ", opportunity: "ประเมินโอกาส",
  timing: "จังหวะเวลา", advice: "ขอคำแนะนำ", risk: "สิ่งที่ควรระวัง",
  relationship: "ทิศทางความสัมพันธ์", yes_no: "คำตอบใช่/ไม่", forecast: "พยากรณ์ช่วงเวลา",
};

export const questionAnalysisSchema = z.object({
  category: z.enum(CATEGORIES),
  intent: z.enum(INTENTS),
  time_horizon: z.string().max(120),
  dimensions: z.array(z.string().max(80)).min(1).max(6),
  understanding: z.string().min(5).max(600),
  ambiguity_level: z.enum(["low", "medium", "high"]),
  clarification_question: z.string().max(300).nullable(),
  recommended_spread: z.string(),
  spread_reason: z.string().max(400),
  sensitivity: z.enum(["none", "health", "legal", "financial", "crisis"]),
});

export type QuestionAnalysis = z.infer<typeof questionAnalysisSchema> & {
  source: "ai" | "heuristic";
};

const text = (max: number) => z.string().min(1).max(max);

export const interpretationSchema = z.object({
  title: text(160),
  tendency: text(120),
  direct_answer: text(1500),
  overall_situation: text(2500),
  cards: z
    .array(
      z.object({
        position: z.number().int().min(1),
        card_id: z.string(),
        headline: text(200),
        interpretation: text(1800),
      }),
    )
    .min(1),
  card_relationships: text(3000),
  energy_analysis: text(2000),
  hidden_factors: text(2000),
  opportunities: z.array(text(500)).min(1).max(6),
  obstacles: z.array(text(500)).min(1).max(6),
  future_direction: text(2000),
  advice: z.array(text(600)).min(1).max(6),
  cautions: z.array(text(500)).min(1).max(5),
  timeline: z
    .array(z.object({ period: text(80), outlook: text(600) }))
    .max(12)
    .nullable(),
  alternative_scenarios: z
    .object({ if_act: text(800), if_wait: text(800) })
    .nullable(),
  conclusion: text(1500),
  examples: z
    .array(
      z.object({
        title: text(120),
        example: text(700),
        positions: z.array(z.number().int().min(1)).min(1).max(10),
      }),
    )
    .min(1)
    .max(3),
  follow_up_questions: z.array(text(200)).min(1).max(4),
  quality_check: z.object({
    answered_question: z.boolean(),
    all_cards_used: z.boolean(),
    positions_respected: z.boolean(),
    contradictions_addressed: z.boolean(),
    no_overclaim: z.boolean(),
  }),
});

export type ReadingExample = z.infer<typeof interpretationSchema>["examples"][number];

/**
 * A saved reading. `examples` is required from every new answer but optional
 * here: readings saved before prompt v2 do not have it.
 */
export type Interpretation = Omit<z.infer<typeof interpretationSchema>, "examples"> & {
  examples?: ReadingExample[];
};
