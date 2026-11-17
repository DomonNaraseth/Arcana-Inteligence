import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, handleError } from "@/lib/api";
import { getContext } from "@/lib/supabase/server";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(8000),
  mood: z.string().trim().max(40).nullable().optional(),
  readingId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "กรุณากรอกหัวข้อและเนื้อหาบันทึก", 400);
    const { title, content, mood, readingId } = parsed.data;
    const { supabase, userKey } = await getContext();

    if (readingId) {
      // RLS guarantees this only resolves for the caller's own reading
      const owned = await supabase
        .from("arcana_readings")
        .select("id")
        .eq("id", readingId)
        .maybeSingle();
      if (!owned.data) return fail("not_found", "ไม่พบการอ่านไพ่ที่อ้างถึง", 404);
    }

    const { data, error } = await supabase
      .from("arcana_journals")
      .insert({
        user_key: userKey,
        title,
        content,
        mood: mood ?? null,
        reading_id: readingId ?? null,
      })
      .select("id, reading_id, title, content, mood, created_at")
      .single();
    if (error) {
      console.error("[arcana] create journal failed:", error.message);
      return fail("server_error", "บันทึกไม่สำเร็จ กรุณาลองใหม่", 500);
    }
    return NextResponse.json({ journal: data });
  } catch (err) {
    return handleError(err);
  }
}
