import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeQuestion } from "@/lib/ai/engine";
import { heuristicAnalysis } from "@/lib/ai/heuristics";
import { fail, handleError } from "@/lib/api";
import { logUsage, withinQuota } from "@/lib/data/readings";
import { getContext } from "@/lib/supabase/server";

export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().trim().min(3).max(1000),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("bad_request", "กรุณาพิมพ์คำถามอย่างน้อย 3 ตัวอักษร (ไม่เกิน 1,000)", 400);
    }
    const { question } = parsed.data;
    const { supabase, userKey } = await getContext();

    if (!(await withinQuota(supabase, "analyze"))) {
      return NextResponse.json({ analysis: heuristicAnalysis(question) });
    }
    const { analysis, usage } = await analyzeQuestion(question);
    await logUsage(supabase, userKey, "analyze", usage);
    return NextResponse.json({ analysis });
  } catch (err) {
    return handleError(err);
  }
}
