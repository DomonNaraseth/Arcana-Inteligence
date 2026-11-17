import { NextResponse } from "next/server";
import { interpretReading, resolveSpread } from "@/lib/ai/engine";
import { PROMPT_VERSION } from "@/lib/ai/schemas";
import { fail, handleError } from "@/lib/api";
import { getReadingBundle, logUsage, withinQuota } from "@/lib/data/readings";
import { getContext } from "@/lib/supabase/server";
import { KNOWLEDGE_BASE_VERSION } from "@/lib/tarot/deck";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, userKey } = await getContext();
    const bundle = await getReadingBundle(supabase, id);
    if (!bundle) return fail("not_found", "ไม่พบการอ่านไพ่นี้", 404);

    // idempotent: an interpreted reading is never regenerated or re-charged
    if (bundle.interpretation) {
      return NextResponse.json({
        interpretation: bundle.interpretation,
        quality: bundle.quality,
      });
    }

    if (!(await withinQuota(supabase, "interpret"))) {
      return fail(
        "quota_exceeded",
        "วันนี้คุณอ่านไพ่ครบจำนวนที่กำหนดแล้ว ลองให้เวลากับคำอ่านที่ได้รับ แล้วกลับมาใหม่พรุ่งนี้",
        429,
      );
    }

    const spread = resolveSpread(bundle.reading.spread_id);
    const drawn = bundle.drawn.filter((d) => !d.isFollowup);

    const { interpretation, usage, quality } = await interpretReading({
      question: bundle.reading.question,
      analysis: bundle.reading.question_analysis,
      spread,
      drawn,
    });

    const { error } = await supabase.from("arcana_reading_analyses").insert({
      reading_id: id,
      content: interpretation,
      quality,
      provider: usage.provider,
      model: usage.model,
      prompt_version: PROMPT_VERSION,
      kb_version: KNOWLEDGE_BASE_VERSION,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });
    if (error) {
      console.error("[arcana] save analysis failed:", error.message);
      return fail("server_error", "ไม่สามารถบันทึกคำอ่านได้ กรุณาลองใหม่", 500);
    }

    await supabase
      .from("arcana_readings")
      .update({
        status: "interpreted",
        title: interpretation.title,
        tendency: interpretation.tendency,
      })
      .eq("id", id);

    // usage is logged only after a successful, saved interpretation
    await logUsage(supabase, userKey, "interpret", usage, id);

    return NextResponse.json({ interpretation, quality });
  } catch (err) {
    return handleError(err);
  }
}
