import { NextResponse } from "next/server";
import { z } from "zod";
import { questionAnalysisSchema } from "@/lib/ai/schemas";
import { fail, handleError } from "@/lib/api";
import { getContext } from "@/lib/supabase/server";
import { KNOWLEDGE_BASE_VERSION } from "@/lib/tarot/deck";
import { DEFAULT_REVERSAL_PROBABILITY, drawForSpread } from "@/lib/tarot/draw";
import { getSpread } from "@/lib/tarot/spreads";

const bodySchema = z.object({
  question: z.string().trim().min(3).max(1000),
  spreadId: z.string().min(1).max(64),
  analysis: questionAnalysisSchema
    .extend({ source: z.enum(["ai", "heuristic"]) })
    .nullable()
    .optional(),
  idempotencyKey: z.string().uuid(),
});

function reversalProbability(): number {
  const n = Number(process.env.ARCANA_REVERSAL_PROBABILITY);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_REVERSAL_PROBABILITY;
}

/**
 * Creates a reading and draws its cards in one step. The draw is performed by
 * the secure randomization engine — the AI is not involved at this stage.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ข้อมูลการเปิดไพ่ไม่ถูกต้อง", 400);
    const { question, spreadId, analysis, idempotencyKey } = parsed.data;

    const spread = getSpread(spreadId);
    if (!spread) return fail("bad_request", "ไม่พบรูปแบบการวางไพ่ที่เลือก", 400);

    const { supabase, userKey } = await getContext();

    // idempotency: a retried request returns the reading it already created
    const existing = await supabase
      .from("arcana_readings")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle<{ id: string }>();
    if (existing.data) return NextResponse.json({ id: existing.data.id });

    const draw = drawForSpread(spread, { reversalProbability: reversalProbability() });

    const { data: reading, error } = await supabase
      .from("arcana_readings")
      .insert({
        user_key: userKey,
        question,
        question_analysis: analysis ?? null,
        spread_id: spread.id,
        status: "drawn",
        draw_meta: draw.meta,
        kb_version: KNOWLEDGE_BASE_VERSION,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !reading) {
      if (error?.code === "23505") {
        const again = await supabase
          .from("arcana_readings")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle<{ id: string }>();
        if (again.data) return NextResponse.json({ id: again.data.id });
      }
      console.error("[arcana] create reading failed:", error?.message);
      return fail("server_error", "ไม่สามารถบันทึกการเปิดไพ่ได้ กรุณาลองใหม่", 500);
    }

    const { error: cardsError } = await supabase.from("arcana_reading_cards").insert(
      draw.cards.map((c) => ({
        reading_id: reading.id,
        position: c.position,
        position_key: c.positionKey,
        card_id: c.cardId,
        orientation: c.orientation,
        is_followup: false,
      })),
    );
    if (cardsError) {
      console.error("[arcana] insert cards failed:", cardsError.message);
      await supabase.from("arcana_readings").delete().eq("id", reading.id);
      return fail("server_error", "ไม่สามารถบันทึกไพ่ที่เปิดได้ กรุณาลองใหม่", 500);
    }

    return NextResponse.json({ id: reading.id });
  } catch (err) {
    return handleError(err);
  }
}
