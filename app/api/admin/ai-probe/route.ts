import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/admin";
import { fail } from "@/lib/api";
import { probeModels } from "@/lib/ai/provider";

export const maxDuration = 120;

const bodySchema = z.object({
  models: z.array(z.string().trim().min(3).max(80)).min(1).max(25),
});

function hasServerSecret(req: Request): boolean {
  const secret = process.env.ARCANA_SERVER_SECRET ?? "";
  const given = req.headers.get("x-arcana-server") ?? "";
  if (secret.length < 32 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * AI health check: reports which gateway models this deployment can reach.
 * Allowed for admins (dashboard) or with the server secret (ops scripts).
 */
export async function POST(req: Request) {
  if (!hasServerSecret(req) && !(await getAdmin())) return fail("not_found", "Not found", 404);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "models[] required", 400);
  return NextResponse.json({ results: await probeModels(parsed.data.models) });
}
