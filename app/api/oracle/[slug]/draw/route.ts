import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { drawOracleCard } from "@/lib/oracle/draw";
import type { OracleDeck } from "@/lib/oracle/schemas";
import { getSystemClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ slug: string }> };

/** One message from a published oracle deck. The card is picked with node:crypto, never by the AI. */
export async function POST(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return fail("not_found", "ไม่พบสำรับไพ่", 404);
  const { data } = await getSystemClient().rpc("arcana_oracle_public_deck", { p_slug: slug });
  const deck = data as OracleDeck | null;
  if (!deck || deck.status !== "published") return fail("not_found", "ไม่พบสำรับไพ่", 404);
  const ready = deck.cards.filter((c) => c.message);
  if (ready.length === 0) return fail("bad_request", "สำรับนี้ยังไม่มีไพ่พร้อมใช้", 409);
  const card = drawOracleCard(ready);
  return NextResponse.json({ number: card.number }, { headers: { "cache-control": "no-store" } });
}
