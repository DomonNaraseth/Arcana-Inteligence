import { NextResponse } from "next/server";
import { getContext } from "@/lib/supabase/server";

/** Email-confirmation / magic-link landing: exchanges the code for a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  try {
    const { supabase } = await getContext();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) await supabase.rpc("arcana_claim_guest");
    }
  } catch (err) {
    console.error("[arcana] auth callback failed", err);
  }
  return NextResponse.redirect(new URL("/account", url.origin));
}
