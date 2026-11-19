import type { NextResponse } from "next/server";
import { fail } from "../api";
import { AiNotConfiguredError, AiProviderError } from "../ai/provider";
import { OracleAiError } from "./ai";
import { OracleImageError } from "./image";

/** Turns an oracle-studio failure into a Thai message for the admin — never a fake result (rule 2). */
export function oracleFailure(err: unknown, where: string): NextResponse {
  if (err instanceof AiNotConfiguredError) {
    return fail("ai_not_configured", "ยังไม่ได้ตั้งค่า AI (Configuration Missing)", 503);
  }
  if (err instanceof AiProviderError) {
    return fail("ai_unavailable", "บริการ AI ไม่ตอบสนองชั่วคราว กรุณาลองใหม่อีกครั้ง", 502);
  }
  if (err instanceof OracleAiError) {
    console.error(`[arcana] ${where}:`, err.message);
    return fail("quality_failed", "AI ตอบกลับไม่ครบตามรูปแบบ 2 ครั้ง ยังไม่ได้บันทึกอะไร — กรุณาลองใหม่", 502);
  }
  if (err instanceof OracleImageError) {
    console.error(`[arcana] ${where}:`, err.message);
    const text =
      err.reason === "not_configured"
        ? "ยังไม่ได้เชื่อม Vercel AI Gateway สำหรับสร้างภาพ (Configuration Missing)"
        : err.reason === "moderated"
          ? "ระบบกรองเนื้อหาของ AI สร้างภาพไม่รับฉากของไพ่ใบนี้ แม้เขียนฉากใหม่ให้นุ่มนวลขึ้นแล้ว — ลองแก้คำบรรยายภาพ (visual) ของใบนี้เอง แล้วกดสร้างภาพอีกครั้ง"
          : err.reason === "refused"
          ? "AI Gateway ปฏิเสธการสร้างภาพ — ตรวจเครดิต AI Gateway ของทีมใน Vercel"
          : "สร้างภาพไม่สำเร็จชั่วคราว กรุณาลองใหม่";
    return fail(err.reason === "not_configured" ? "ai_not_configured" : "ai_unavailable", text, 502);
  }
  console.error(`[arcana] ${where}:`, err);
  return fail("server_error", "ดำเนินการไม่สำเร็จ กรุณาลองใหม่", 500);
}
