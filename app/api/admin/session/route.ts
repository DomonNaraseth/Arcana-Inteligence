import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { ADMIN_COOKIE, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ key: z.string().trim().min(32).max(200) });

/** Operator sign-in with the access key. The key is verified in SQL. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "รหัสเข้าถึงไม่ถูกต้อง", 400);

  try {
    const { supabase } = await getContext();
    const { data, error } = await supabase.rpc("arcana_admin_login", { p_key: parsed.data.key });
    if (error) {
      console.error("[arcana] admin login failed:", error.message);
      return fail("server_error", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่", 500);
    }
    if (data === "locked") {
      return fail("quota_exceeded", "พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่", 429);
    }
    if (data !== "ok") return fail("forbidden", "รหัสเข้าถึงไม่ถูกต้อง", 403);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, parsed.data.key, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch (err) {
    console.error("[arcana] admin login error", err);
    return fail("server_error", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
