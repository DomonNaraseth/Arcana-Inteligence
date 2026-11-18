import { NextResponse } from "next/server";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";
import { generateConcept } from "@/lib/oracle/ai";
import { oracleFailure } from "@/lib/oracle/errors";
import { briefSchema } from "@/lib/oracle/schemas";

export const maxDuration = 300;

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

/** New deck: the AI plans the concept and card list from the owner's brief, then the deck is saved as a draft. */
export const POST = adminRoute(async (admin, req) => {
  const parsed = briefSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "กรอกบรีฟให้ครบ: แนวคิดอย่างน้อย 10 ตัวอักษร และจำนวนไพ่ 8–78 ใบ", 400);
  const brief = parsed.data;

  let draft;
  try {
    draft = (await generateConcept(brief)).value;
  } catch (err) {
    return oracleFailure(err, "oracle concept");
  }

  const { cards, title, title_en, tagline, ...concept } = draft;
  const { data: id, error } = await admin.supabase.rpc("arcana_admin_oracle_create", {
    p_title: title,
    p_slug: slugOf(title_en),
    p_card_count: brief.card_count,
    p_brief: brief,
    p_concept: concept,
    p_title_en: title_en,
    p_tagline: tagline,
  });
  if (error || typeof id !== "string") return error ? rpcFailure(error) : fail("server_error", "บันทึกสำรับไม่สำเร็จ", 500);

  const saved = await admin.supabase.rpc("arcana_admin_oracle_save_cards", { p_id: id, p_cards: cards });
  if (saved.error) return rpcFailure(saved.error);
  return NextResponse.json({ id });
});
