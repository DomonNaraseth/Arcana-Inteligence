import { NextResponse } from "next/server";
import { z } from "zod";
import { answerFollowUp, resolveSpread } from "@/lib/ai/engine";
import type { ChatMessage } from "@/lib/ai/provider";
import { fail, handleError } from "@/lib/api";
import { getReadingBundle, logUsage, withinQuota } from "@/lib/data/readings";
import { getContext } from "@/lib/supabase/server";
import { requireCard } from "@/lib/tarot/deck";
import { drawAdditional } from "@/lib/tarot/draw";

export const maxDuration = 120;

const MAX_EXTRA_CARDS = 3;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  /** user explicitly pressed "draw a clarifier card" */
  drawCard: z.boolean().optional().default(false),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "กรุณาพิมพ์คำถามต่อยอด", 400);
    const { message, drawCard } = parsed.data;

    const { supabase, userKey } = await getContext();
    const bundle = await getReadingBundle(supabase, id);
    if (!bundle) return fail("not_found", "ไม่พบการอ่านไพ่นี้", 404);
    if (!bundle.interpretation) {
      return fail("bad_request", "ต้องอ่านไพ่ชุดนี้ให้เสร็จก่อนจึงจะถามต่อได้", 400);
    }
    if (!(await withinQuota(supabase, "followup"))) {
      return fail("quota_exceeded", "วันนี้คุณถามต่อครบจำนวนที่กำหนดแล้ว กลับมาใหม่พรุ่งนี้", 429);
    }

    let drawn = bundle.drawn;
    let newCard: (typeof drawn)[number] | null = null;

    if (drawCard) {
      const extraCount = drawn.filter((d) => d.isFollowup).length;
      if (extraCount >= MAX_EXTRA_CARDS) {
        return fail(
          "bad_request",
          `เปิดไพ่เสริมได้สูงสุด ${MAX_EXTRA_CARDS} ใบต่อการอ่านหนึ่งครั้ง หากมีคำถามใหม่ แนะนำให้เริ่มการอ่านไพ่ใหม่`,
          400,
        );
      }
      const nextPosition = Math.max(...drawn.map((d) => d.position)) + 1;
      // existing cards are excluded and never modified
      [newCard] = drawAdditional(
        1,
        drawn.map((d) => d.cardId),
        nextPosition,
      );
      const { error } = await supabase.from("arcana_reading_cards").insert({
        reading_id: id,
        position: newCard.position,
        position_key: newCard.positionKey,
        card_id: newCard.cardId,
        orientation: newCard.orientation,
        is_followup: true,
      });
      if (error) {
        console.error("[arcana] insert clarifier failed:", error.message);
        return fail("server_error", "ไม่สามารถเปิดไพ่เสริมได้ กรุณาลองใหม่", 500);
      }
      drawn = [...drawn, newCard];
    }

    const history: ChatMessage[] = bundle.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const userContent = newCard
      ? `${message}\n\n[ผู้ถามกดเปิดไพ่เสริม 1 ใบ ได้ไพ่: ${requireCard(newCard.cardId).name} (${
          newCard.orientation === "upright" ? "ตั้งตรง" : "กลับหัว"
        }) — กรุณาอ่านไพ่เสริมใบนี้ประกอบคำถามข้างต้น โดยแยกให้ชัดจากไพ่ชุดเดิม]`
      : message;

    const { reply, usage } = await answerFollowUp({
      question: bundle.reading.question,
      analysis: bundle.reading.question_analysis,
      spread: resolveSpread(bundle.reading.spread_id),
      drawn,
      interpretation: bundle.interpretation,
      history,
      message: userContent,
    });

    const base = Date.now();
    const { error: msgError } = await supabase.from("arcana_messages").insert([
      {
        reading_id: id,
        role: "user",
        content: userContent,
        kind: newCard ? "draw" : "chat",
        created_at: new Date(base).toISOString(),
      },
      {
        reading_id: id,
        role: "assistant",
        content: reply.slice(0, 8000),
        kind: "chat",
        created_at: new Date(base + 1).toISOString(),
      },
    ]);
    if (msgError) console.error("[arcana] save messages failed:", msgError.message);

    await logUsage(supabase, userKey, "followup", usage, id);

    return NextResponse.json({ reply, newCard });
  } catch (err) {
    return handleError(err);
  }
}
