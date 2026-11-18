import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { fail } from "./api";
import { ConfigError, getContext, supabaseConfigured } from "./supabase/server";

export type AdminRole = "owner" | "admin";

export interface AdminContext {
  supabase: SupabaseClient;
  role: AdminRole;
  /** signed-in email, or null when using the operator key */
  email: string | null;
}

/**
 * Resolves the caller's admin role. The decision is made in SQL
 * (arcana_admin_role) from the verified JWT email or the operator-key cookie —
 * never from anything the browser can assert about itself.
 */
export async function getAdmin(): Promise<AdminContext | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { supabase, user } = await getContext();
    const { data, error } = await supabase.rpc("arcana_admin_role");
    if (error || (data !== "owner" && data !== "admin")) return null;
    return { supabase, role: data, email: user?.email ?? null };
  } catch (err) {
    if (!(err instanceof ConfigError)) console.error("[arcana] admin check failed", err);
    return null;
  }
}

/** For server components under /admin: anyone else is sent to the login page. */
export async function requireAdminPage(): Promise<AdminContext> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

type AdminHandler = (admin: AdminContext, req: Request) => Promise<NextResponse>;

/**
 * Wraps an admin API handler. Non-admins get a 404 so the surface is not
 * advertised; SQL permission errors (e.g. owner-only actions) become 403.
 */
/** True when the caller is an owner or admin — decided in SQL, like every admin check. */
export async function isAdminCaller(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("arcana_admin_role");
  return data === "owner" || data === "admin";
}

export function adminRoute(handler: AdminHandler) {
  return async (req: Request): Promise<NextResponse> => {
    const admin = await getAdmin();
    if (!admin) return fail("not_found", "Not found", 404);
    try {
      return await handler(admin, req);
    } catch (err) {
      console.error("[arcana] admin route failed", err);
      return fail("server_error", "ดำเนินการไม่สำเร็จ กรุณาลองใหม่", 500);
    }
  };
}

/** Maps a PostgREST error from an admin RPC to an API response. */
export function rpcFailure(error: { code?: string; message: string }): NextResponse {
  if (error.code === "42501") {
    return fail("forbidden", "การดำเนินการนี้ต้องใช้สิทธิ์ Owner", 403);
  }
  const msg = error.message.replace(/^arcana:\s*/, "");
  if (/user not found/.test(msg)) return fail("not_found", "ไม่พบผู้ใช้ที่ระบุ", 404);
  if (/invalid/.test(msg)) return fail("bad_request", "ข้อมูลไม่ถูกต้อง", 400);
  console.error("[arcana] admin rpc error:", error.message);
  return fail("server_error", "ดำเนินการไม่สำเร็จ กรุณาลองใหม่", 500);
}
