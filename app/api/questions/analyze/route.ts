import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeQuestion } from "@/lib/ai/engine";
import { heuristicAnalysis } from "@/lib/ai/heuristics";
import type { QuestionAnalysis } from "@/lib/ai/schemas";
import { fail, handleError } from "@/lib/api";
import { logUsage, withinQuota } from "@/lib/data/readings";
import { getSettings, type Settings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";
import { getKnowledge } from "@/lib/tarot/knowledge";
import { enabledSpreads, fallbackSpreadId } from "@/lib/tarot/spreads";

export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().trim().min(3).max(1000),
});

/** Never recommend a spread the admin has switched off. */
function respectDisabled(analysis: QuestionAnalysis, settings: Settings): QuestionAnalysis {
  if (!settings.disabled_spreads.includes(analysis.recommended_spread)) return analysis;
  return {
    ...analysis,
    recommended_spread: fallbackSpreadId(settings.disabled_spreads),
    spread_reason: "รูปแบบที่เหมาะที่สุดปิดให้บริการชั่วคราว จึงแนะนำรูปแบบที่ใกล้เคียงแทน",
  };
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("bad_request", "กรุณาพิมพ์คำถามอย่างน้อย 3 ตัวอักษร (ไม่เกิน 1,000)", 400);
    }
    const { question } = parsed.data;
    const { supabase, userKey } = await getContext();
    const settings = await getSettings(supabase);

    if (!(await withinQuota(supabase, "analyze", settings.limits.daily_analyses))) {
      return NextResponse.json({
        analysis: respectDisabled(heuristicAnalysis(question), settings),
      });
    }
    const kb = await getKnowledge(supabase);
    const { analysis, usage } = await analyzeQuestion(
      question,
      enabledSpreads(settings.disabled_spreads, kb.spreads),
    );
    await logUsage(supabase, userKey, "analyze", usage);
    return NextResponse.json({ analysis: respectDisabled(analysis, settings) });
  } catch (err) {
    return handleError(err, "/api/questions/analyze");
  }
}
