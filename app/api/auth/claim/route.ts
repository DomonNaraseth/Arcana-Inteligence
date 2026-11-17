import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { getContext } from "@/lib/supabase/server";

/** After sign-in: moves this browser's guest readings into the account. */
export async function POST() {
  try {
    const { supabase, user } = await getContext();
    if (!user) return NextResponse.json({ claimed: 0 });
    const { data, error } = await supabase.rpc("arcana_claim_guest");
    if (error) console.error("[arcana] claim failed:", error.message);
    return NextResponse.json({ claimed: typeof data === "number" ? data : 0 });
  } catch (err) {
    return handleError(err);
  }
}
