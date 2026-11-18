import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin";
import { slipOkHealth } from "@/lib/billing/slip";

/** Whether automatic slip checking really reaches SlipOK (quota + one non-slip probe). Never returns the key. */
export const POST = adminRoute(async () => NextResponse.json(await slipOkHealth()));
