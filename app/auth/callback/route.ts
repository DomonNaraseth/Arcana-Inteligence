import { NextResponse } from "next/server";
import { getContext } from "@/lib/supabase/server";

/** Only same-site relative paths are accepted as a post-login destination. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/account";
  if (raw.startsWith("/auth/") || raw.startsWith("/api/")) return "/account";
  return raw.slice(0, 300);
}

/**
 * Landing for Google sign-in and email confirmation (PKCE): exchanges the
 * code for a session, then moves this browser's guest data — readings,
 * journal, credits — into the account so nothing read as a guest is lost.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const failure = new URL("/account", url.origin);
  failure.searchParams.set("auth", "error");

  if (url.searchParams.get("error") || !code) {
    return NextResponse.redirect(failure);
  }

  try {
    const { supabase } = await getContext();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[arcana] auth code exchange failed:", error.message);
      return NextResponse.redirect(failure);
    }
    const { data: claimed, error: claimError } = await supabase.rpc("arcana_claim_guest");
    if (claimError) console.error("[arcana] guest claim failed:", claimError.message);

    const target = new URL(next, url.origin);
    target.searchParams.set("auth", "ok");
    if (typeof claimed === "number" && claimed > 0) {
      target.searchParams.set("claimed", String(claimed));
    }
    return NextResponse.redirect(target);
  } catch (err) {
    console.error("[arcana] auth callback failed", err);
    return NextResponse.redirect(failure);
  }
}
