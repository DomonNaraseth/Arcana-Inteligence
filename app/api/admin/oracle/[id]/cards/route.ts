import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";
import { generateCardTexts } from "@/lib/oracle/ai";
import { oracleFailure } from "@/lib/oracle/errors";
import type { OracleDeck } from "@/lib/oracle/schemas";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const editSchema = z
  .object({
    number: z.number().int().min(1).max(78),
    name: z.string().trim().min(1).max(80),
    name_en: z.string().trim().max(80),
    essence: z.string().trim().max(300),
    keywords: z.array(z.string().trim().min(1).max(40)).max(8),
    meaning: z.string().trim().max(2000),
    message: z.string().trim().max(1200),
    affirmation: z.string().trim().max(300),
    reflection: z.string().trim().max(300),
    visual: z.string().trim().max(1200),
  })
  .partial()
  .required({ number: true, name: true });

const bodySchema = z.union([
  /** AI writes these cards (8 at most per request, so no request times out) */
  z.object({ write: z.array(z.number().int().min(1).max(78)).min(1).max(8) }).strict(),
  /** the owner's own edit of one card */
  z.object({ edit: editSchema }).strict(),
]);

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminRoute(async (admin) => {
    if (!z.string().uuid().safeParse(id).success) return fail("not_found", "ไม่พบสำรับ", 404);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ข้อมูลไม่ถูกต้อง", 400);

    const { data, error } = await admin.supabase.rpc("arcana_admin_oracle_get", { p_id: id });
    if (error) return rpcFailure(error);
    const deck = data as OracleDeck | null;
    if (!deck) return fail("not_found", "ไม่พบสำรับ", 404);

    if ("edit" in parsed.data) {
      const edit = parsed.data.edit;
      if (edit.number > deck.card_count) return fail("bad_request", "หมายเลขไพ่เกินจำนวนในสำรับ", 400);
      const saved = await admin.supabase.rpc("arcana_admin_oracle_save_cards", { p_id: id, p_cards: [edit] });
      if (saved.error) return rpcFailure(saved.error);
      return NextResponse.json({ saved: 1 });
    }

    const numbers = [...new Set(parsed.data.write)].filter((n) => deck.cards.some((c) => c.number === n));
    if (numbers.length === 0) return fail("bad_request", "ไม่พบไพ่ที่เลือก", 400);
    let texts;
    try {
      texts = (
        await generateCardTexts({
          title: deck.title,
          title_en: deck.title_en,
          concept: deck.concept,
          allCards: deck.cards.map(({ number, name, name_en, essence }) => ({ number, name, name_en, essence })),
          numbers,
        })
      ).value;
    } catch (err) {
      return oracleFailure(err, "oracle card texts");
    }
    // the AI writes text only; names and numbers stay as planned
    const cards = texts.map((t) => ({ ...t, name: deck.cards.find((c) => c.number === t.number)!.name }));
    const saved = await admin.supabase.rpc("arcana_admin_oracle_save_cards", { p_id: id, p_cards: cards });
    if (saved.error) return rpcFailure(saved.error);
    return NextResponse.json({ saved: cards.length, cards });
  })(req);
}
