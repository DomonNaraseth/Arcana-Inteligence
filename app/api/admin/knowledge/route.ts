import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";
import { getCard } from "@/lib/tarot/deck";
import { invalidateKnowledge } from "@/lib/tarot/knowledge";
import {
  cardOverrideSchema,
  diffCard,
  diffSpread,
  spreadOverrideSchema,
} from "@/lib/tarot/overrides";
import { getSpread } from "@/lib/tarot/spreads";

const bodySchema = z.object({
  type: z.enum(["card", "spread"]),
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  fields: z.unknown().optional(),
  /** true = discard the override and return to the shipped default */
  reset: z.boolean().optional().default(false),
});

/**
 * Save or reset an override of knowledge-base text. Only the fields that
 * differ from the shipped default are stored; saving values identical to the
 * default removes the override entirely.
 */
export const POST = adminRoute(async (admin, req) => {
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "คำขอไม่ถูกต้อง", 400);
  const { type, id, reset } = body.data;

  const base = type === "card" ? getCard(id) : getSpread(id);
  if (!base) {
    return fail("not_found", type === "card" ? "ไม่พบไพ่ใบนี้" : "ไม่พบรูปแบบการวางไพ่นี้", 404);
  }

  let fields: Record<string, unknown> = {};
  if (!reset) {
    const schema = type === "card" ? cardOverrideSchema : spreadOverrideSchema;
    const parsed = schema.safeParse(body.data.fields);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(
        "bad_request",
        `ข้อมูลไม่ถูกต้องที่ช่อง ${issue.path.join(".") || "(ทั้งหมด)"}: ${issue.message}`,
        400,
      );
    }
    if (type === "spread") {
      const spread = getSpread(id)!;
      const input = parsed.data as z.infer<typeof spreadOverrideSchema>;
      if (input.positions && input.positions.length !== spread.positions.length) {
        return fail(
          "bad_request",
          `รูปแบบนี้มี ${spread.positions.length} ตำแหน่ง ต้องส่งมาให้ครบทุกตำแหน่ง`,
          400,
        );
      }
      fields = diffSpread(spread, input);
    } else {
      fields = diffCard(getCard(id)!, parsed.data as z.infer<typeof cardOverrideSchema>);
    }
  }

  if (Object.keys(fields).length === 0) {
    const { error } = await admin.supabase.rpc("arcana_admin_reset_kb_override", {
      p_type: type,
      p_id: id,
    });
    if (error) return rpcFailure(error);
    invalidateKnowledge();
    return NextResponse.json({ ok: true, overridden: false, fields: [] });
  }

  const { data, error } = await admin.supabase.rpc("arcana_admin_set_kb_override", {
    p_type: type,
    p_id: id,
    p_fields: fields,
  });
  if (error) return rpcFailure(error);
  invalidateKnowledge();
  return NextResponse.json({
    ok: true,
    overridden: true,
    fields: Object.keys(fields),
    revision: data,
  });
});
