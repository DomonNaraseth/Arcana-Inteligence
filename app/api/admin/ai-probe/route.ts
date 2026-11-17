import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { probeModels } from "@/lib/ai/provider";

export const maxDuration = 120;

const bodySchema = z.object({
  models: z.array(z.string().min(3).max(80)).min(1).max(25),
});

function authorized(req: Request): boolean {
  const secret = process.env.ARCANA_SERVER_SECRET ?? "";
  const given = req.headers.get("x-arcana-server") ?? "";
  if (secret.length < 32 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * Operator-only AI health check: reports which gateway models this deployment
 * can actually reach. Requires the server secret; returns no user data.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return fail("not_found", "Not found", 404);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "models[] required", 400);
  return NextResponse.json({ results: await probeModels(parsed.data.models) });
}
