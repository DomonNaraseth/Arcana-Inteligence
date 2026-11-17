import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";

const bodySchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email().max(200)).max(20),
});

/** Replace the admin email list. Owner only — enforced in SQL. */
export const POST = adminRoute(async (admin, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "รูปแบบอีเมลไม่ถูกต้อง", 400);
  const emails = [...new Set(parsed.data.emails)];
  const { error } = await admin.supabase.rpc("arcana_admin_set_admin_emails", {
    p_emails: emails,
  });
  if (error) return rpcFailure(error);
  return NextResponse.json({ ok: true, emails });
});
