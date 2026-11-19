import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";
import { oracleFailure } from "@/lib/oracle/errors";
import { rewriteRefusedScene } from "@/lib/oracle/ai";
import { OracleImageError, paint } from "@/lib/oracle/image";
import { imagePrompt } from "@/lib/oracle/prompts";
import type { OracleDeck } from "@/lib/oracle/schemas";

/** one picture per request: a few to ~60 s, well inside the limit */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.union([
  z.object({ target: z.literal("card"), number: z.number().int().min(1).max(78) }).strict(),
  z.object({ target: z.enum(["cover", "back"]) }).strict(),
]);

/** Paints a card, the cover or the card back with AI and stores it (replacing the old picture). */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminRoute(async (admin) => {
    if (!z.string().uuid().safeParse(id).success) return fail("not_found", "ไม่พบสำรับ", 404);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ข้อมูลไม่ถูกต้อง", 400);
    const body = parsed.data;

    const { data, error } = await admin.supabase.rpc("arcana_admin_oracle_get", { p_id: id });
    if (error) return rpcFailure(error);
    const deck = data as OracleDeck | null;
    if (!deck) return fail("not_found", "ไม่พบสำรับ", 404);
    if (!deck.concept.style) return fail("bad_request", "สำรับนี้ยังไม่มีแนวทางภาพ (style) ในคอนเซป", 400);

    const card = body.target === "card" ? deck.cards.find((c) => c.number === body.number) : undefined;
    if (body.target === "card" && !card) return fail("not_found", "ไม่พบไพ่ใบนี้", 404);
    if (card && !card.visual && !card.essence) return fail("bad_request", "เขียนเนื้อหาไพ่ใบนี้ก่อน แล้วจึงสร้างภาพ", 400);

    const title_en = deck.title_en || deck.title;
    let prompt = imagePrompt({ title_en, concept: deck.concept, target: body.target, card });
    let picture;
    let rewritten: string | null = null;
    try {
      try {
        picture = await paint(prompt);
      } catch (err) {
        // The content filter refused this card's scene: describe it again without
        // the details filters flag, then try once more. The new scene is kept on
        // the card (visible and editable in the studio) only if it paints.
        if (!(err instanceof OracleImageError) || err.reason !== "moderated") throw err;
        console.error("[arcana] oracle image moderated, retrying gently:", err.message);
        if (card?.visual) rewritten = await rewriteRefusedScene(card);
        prompt = imagePrompt({
          title_en,
          concept: deck.concept,
          target: body.target,
          card: card && rewritten ? { ...card, visual: rewritten } : card,
          gentle: true,
        });
        picture = await paint(prompt);
      }
    } catch (err) {
      if (card) {
        await admin.supabase.rpc("arcana_admin_oracle_image_failed", {
          p_id: id,
          p_number: card.number,
          p_error: (err as Error).message,
        });
      }
      return oracleFailure(err, "oracle image");
    }

    if (card && rewritten) {
      const saved = await admin.supabase.rpc("arcana_admin_oracle_save_cards", {
        p_id: id,
        p_cards: [{ number: card.number, name: card.name, visual: rewritten }],
      });
      if (saved.error) return rpcFailure(saved.error);
    }

    const { data: imageId, error: saveError } = await admin.supabase.rpc("arcana_admin_oracle_set_image", {
      p_id: id,
      p_target: body.target,
      p_number: card?.number ?? null,
      p_mime: picture.mime,
      p_b64: picture.bytes.toString("base64"),
      p_model: picture.model,
      p_prompt: prompt,
    });
    if (saveError) return rpcFailure(saveError);
    return NextResponse.json({ image: imageId, model: picture.model, bytes: picture.bytes.length, visual: rewritten });
  })(req);
}
