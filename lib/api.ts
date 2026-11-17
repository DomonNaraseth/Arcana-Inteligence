import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AiNotConfiguredError, AiProviderError } from "./ai/provider";
import { InterpretationQualityError } from "./ai/engine";
import { ConfigError, getContext } from "./supabase/server";

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "forbidden"
  | "config_missing"
  | "ai_not_configured"
  | "ai_unavailable"
  | "quality_failed"
  | "quota_exceeded"
  | "insufficient_credits"
  | "server_error";

export function fail(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function classify(err: unknown): { code: ApiErrorCode; detail: string } {
  if (err instanceof ZodError) return { code: "bad_request", detail: "invalid request body" };
  if (err instanceof ConfigError) return { code: "config_missing", detail: err.message };
  if (err instanceof AiNotConfiguredError) return { code: "ai_not_configured", detail: err.message };
  if (err instanceof AiProviderError) return { code: "ai_unavailable", detail: err.message };
  if (err instanceof InterpretationQualityError) {
    return { code: "quality_failed", detail: err.issues.join(" | ") };
  }
  return { code: "server_error", detail: err instanceof Error ? err.message : String(err) };
}

/**
 * Maps thrown errors to honest, user-readable API responses and records
 * operational failures in arcana_error_logs (Admin → Logs).
 */
export async function handleError(err: unknown, route?: string) {
  const { code, detail } = classify(err);

  if (route && code !== "bad_request" && code !== "config_missing") {
    try {
      const { supabase } = await getContext();
      await supabase.rpc("arcana_log_error", {
        p_route: route,
        p_code: code,
        p_message: detail,
      });
    } catch {
      // logging must never mask the original error
    }
  }

  switch (code) {
    case "bad_request":
      return fail(code, "ข้อมูลที่ส่งมาไม่ถูกต้อง", 400);
    case "config_missing":
      return fail(code, "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    case "ai_not_configured":
      return fail(
        code,
        "ระบบ AI ยังไม่ได้ตั้งค่า (Configuration Missing) — ผู้ดูแลระบบต้องเพิ่ม ANTHROPIC_API_KEY ก่อนจึงจะอ่านไพ่ได้",
        503,
      );
    case "ai_unavailable":
      console.error("[arcana] AI provider error:", detail);
      return fail(
        code,
        "ระบบ AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง ไพ่ของคุณยังอยู่ครบ และไม่มีการหักเครดิต",
        502,
      );
    case "quality_failed":
      console.error("[arcana] quality validation failed:", detail);
      return fail(
        code,
        "คำอ่านไม่ผ่านการตรวจคุณภาพ ระบบจึงไม่แสดงผล กรุณากดอ่านไพ่อีกครั้ง ไพ่ของคุณยังอยู่ครบ และไม่มีการหักเครดิต",
        502,
      );
    default:
      console.error("[arcana] unexpected error:", err);
      return fail("server_error", "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่", 500);
  }
}
