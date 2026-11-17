import { NextResponse } from "next/server";
import { interpretReading } from "@/lib/ai/engine";
import { fail, handleError } from "@/lib/api";
import { getWallet, spendCredits } from "@/lib/credits";
import { getReadingBundle, logUsage, withinQuota } from "@/lib/data/readings";
import { getSettings, interpretCost, promptVersionFor } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";
import { getKnowledge } from "@/lib/tarot/knowledge";

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
        charged: 0,
      });
    }

    const [settings, kb] = await Promise.all([getSettings(supabase), getKnowledge(supabase)]);
    const spread = kb.resolveSpread(bundle.reading.spread_id);
    const drawn = bundle.drawn.filter((d) => !d.isFollowup);
    const cost = settings.credits.enabled ? interpretCost(settings, drawn.length) : 0;

    if (settings.credits.enabled) {
      const wallet = await getWallet(supabase);
      if (!wallet) return fail("server_error", "ตรวจสอบเครดิตไม่สำเร็จ กรุณาลองใหม่", 500);
      if (wallet.balance < cost) {
        return fail(
          "insufficient_credits",
          `เครดิตไม่พอ — การอ่านไพ่ชุดนี้ใช้ ${cost} เครดิต คุณมี ${wallet.balance} เครดิต ไพ่ของคุณถูกบันทึกไว้แล้ว กลับมาอ่านได้เมื่อได้รับเครดิตรายวันหรือเติมเครดิต`,
          402,
        );
      }
    } else if (!(await withinQuota(supabase, "interpret", settings.limits.daily_readings))) {
      return fail(
        "quota_exceeded",
        "วันนี้คุณอ่านไพ่ครบจำนวนที่กำหนดแล้ว ลองให้เวลากับคำอ่านที่ได้รับ แล้วกลับมาใหม่พรุ่งนี้",
        429,
      );
    }

    const { interpretation, usage, quality } = await interpretReading({
      question: bundle.reading.question,
      analysis: bundle.reading.question_analysis,
      spread,
      drawn,
      cardOf: kb.requireCard,
      kbVersion: kb.version,
      addendum: settings.prompt_addendum.text,
    });

    const { error } = await supabase.from("arcana_reading_analyses").insert({
      reading_id: id,
      content: interpretation,
      quality,
      provider: usage.provider,
      model: usage.model,
      prompt_version: promptVersionFor(settings),
      kb_version: kb.version,
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

    // Charge and meter only after the reading is saved: a failed AI request
    // costs the user nothing, and the idempotency key rules out double charges.
    const spent = await spendCredits(supabase, {
      amount: cost,
      feature: "interpret",
      readingId: id,
      idempotencyKey: `interpret:${id}`,
    });
    await logUsage(supabase, userKey, "interpret", usage, id);

    return NextResponse.json({
      interpretation,
      quality,
      charged: spent.charged,
      balance: spent.balance,
    });
  } catch (err) {
    return handleError(err, "/api/readings/[id]/interpret");
  }
}
