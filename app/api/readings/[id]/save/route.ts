import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, handleError } from "@/lib/api";
import { getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ saved: z.boolean() });

/** Bookmark / un-bookmark a reading. Ownership is enforced by RLS. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("not_found", "ไม่พบการอ่านไพ่นี้", 404);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "คำขอไม่ถูกต้อง", 400);

    const { supabase } = await getContext();
    const savedAt = parsed.data.saved ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from("arcana_readings")
      .update({ saved_at: savedAt })
      .eq("id", id)
      .select("id, saved_at")
      .maybeSingle<{ id: string; saved_at: string | null }>();
    if (error) {
      console.error("[arcana] save reading failed:", error.message);
      return fail("server_error", "บันทึกไม่สำเร็จ กรุณาลองใหม่", 500);
    }
    if (!data) return fail("not_found", "ไม่พบการอ่านไพ่นี้", 404);
    return NextResponse.json({ saved: Boolean(data.saved_at), savedAt: data.saved_at });
  } catch (err) {
    return handleError(err, "/api/readings/[id]/save");
  }
}
