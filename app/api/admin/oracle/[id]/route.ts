import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";
import { styleSchema } from "@/lib/oracle/schemas";

type Ctx = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    title_en: z.string().trim().max(120).optional(),
    tagline: z.string().trim().max(300).optional(),
    concept: z
      .object({
        story: z.string().max(1800),
        how_to_use: z.string().max(1500),
        themes: z.array(z.string().max(80)).max(8),
        audience: z.string().max(300),
        tone: z.string().max(200),
        guidebook_intro: z.string().max(1800),
        style: styleSchema,
      })
      .partial()
      .optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminRoute(async (admin) => {
    if (!uuid.safeParse(id).success) return fail("not_found", "ไม่พบสำรับ", 404);
    const { data, error } = await admin.supabase.rpc("arcana_admin_oracle_get", { p_id: id });
    if (error) return rpcFailure(error);
    if (!data) return fail("not_found", "ไม่พบสำรับ", 404);
    return NextResponse.json({ deck: data }, { headers: { "cache-control": "no-store" } });
  })(req);
}

/** Edits the deck's titles and concept, or publishes / unpublishes it. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminRoute(async (admin) => {
    if (!uuid.safeParse(id).success) return fail("not_found", "ไม่พบสำรับ", 404);
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ข้อมูลไม่ถูกต้อง", 400);
    const { publish, concept, ...rest } = parsed.data;

    if (concept || Object.keys(rest).length) {
      let patch: Record<string, unknown> = { ...rest };
      if (concept) {
        // merge into the stored concept so a partial edit keeps the other fields
        const { data: deck, error } = await admin.supabase.rpc("arcana_admin_oracle_get", { p_id: id });
        if (error) return rpcFailure(error);
        if (!deck) return fail("not_found", "ไม่พบสำรับ", 404);
        patch = { ...patch, concept: { ...(deck as { concept: object }).concept, ...concept } };
      }
      const { error } = await admin.supabase.rpc("arcana_admin_oracle_update", { p_id: id, p_patch: patch });
      if (error) return rpcFailure(error);
    }
    if (publish !== undefined) {
      const { error } = await admin.supabase.rpc("arcana_admin_oracle_publish", { p_id: id, p_publish: publish });
      if (error) return rpcFailure(error);
    }
    return NextResponse.json({ ok: true });
  })(req);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminRoute(async (admin) => {
    if (!uuid.safeParse(id).success) return fail("not_found", "ไม่พบสำรับ", 404);
    const { data, error } = await admin.supabase.rpc("arcana_admin_oracle_delete", { p_id: id });
    if (error) return rpcFailure(error);
    if (!data) return fail("not_found", "ไม่พบสำรับ", 404);
    return NextResponse.json({ ok: true });
  })(req);
}
