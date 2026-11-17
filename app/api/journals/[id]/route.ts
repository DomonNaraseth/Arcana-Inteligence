import { NextResponse } from "next/server";
import { fail, handleError } from "@/lib/api";
import { getContext } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("not_found", "ไม่พบบันทึกนี้", 404);
    const { supabase } = await getContext();
    const { error, count } = await supabase
      .from("arcana_journals")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) return fail("server_error", "ลบไม่สำเร็จ กรุณาลองใหม่", 500);
    if (!count) return fail("not_found", "ไม่พบบันทึกนี้", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
