import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AiNotConfiguredError, AiProviderError } from "./ai/provider";
import { InterpretationQualityError } from "./ai/engine";
import { ConfigError } from "./supabase/server";

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "config_missing"
  | "ai_not_configured"
  | "ai_unavailable"
  | "quality_failed"
  | "quota_exceeded"
  | "server_error";

export function fail(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Maps thrown errors to honest, user-readable API responses. */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("bad_request", "ข้อมูลที่ส่งมาไม่ถูกต้อง", 400);
  }
  if (err instanceof ConfigError) {
    return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
  }
  if (err instanceof AiNotConfiguredError) {
    return fail(
      "ai_not_configured",
      "ระบบ AI ยังไม่ได้ตั้งค่า (Configuration Missing) — ผู้ดูแลระบบต้องเพิ่ม ANTHROPIC_API_KEY ก่อนจึงจะอ่านไพ่ได้",
      503,
    );
  }
  if (err instanceof AiProviderError) {
    console.error("[arcana] AI provider error:", err.message);
    return fail(
      "ai_unavailable",
      "ระบบ AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง ไพ่ของคุณยังอยู่ครบ",
      502,
    );
  }
  if (err instanceof InterpretationQualityError) {
    console.error("[arcana] quality validation failed:", err.issues);
    return fail(
      "quality_failed",
      "คำอ่านไม่ผ่านการตรวจคุณภาพ ระบบจึงไม่แสดงผล กรุณากดอ่านไพ่อีกครั้ง ไพ่ของคุณยังอยู่ครบ",
      502,
    );
  }
  console.error("[arcana] unexpected error:", err);
  return fail("server_error", "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่", 500);
}
