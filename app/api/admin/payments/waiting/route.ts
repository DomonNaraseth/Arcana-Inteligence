import { NextResponse } from "next/server";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { summarizeWaiting } from "@/lib/billing/watch";

export const dynamic = "force-dynamic";

/** Polled by the admin payments page: how many reported transfers are waiting, and the newest one. */
export const GET = adminRoute(async (admin) => {
  const { data, error } = await admin.supabase.rpc("arcana_admin_payments", { p_limit: 200 });
  if (error) return rpcFailure(error);
  return NextResponse.json(summarizeWaiting((data ?? []) as Parameters<typeof summarizeWaiting>[0]), {
    headers: { "cache-control": "no-store" },
  });
});
