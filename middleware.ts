import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const GUEST_COOKIE = "arcana_key";

function newGuestKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `g:${hex}`;
}

export async function middleware(request: NextRequest) {
  // Issue a secret guest session token on first visit so the reading flow
  // works without sign-up. Set on the request too so this same render sees it.
  let issued: string | null = null;
  if (!request.cookies.get(GUEST_COOKIE)?.value?.startsWith("g:")) {
    issued = newGuestKey();
    request.cookies.set(GUEST_COOKIE, issued);
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options?: CookieOptions }[]) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    // refresh the auth session if one exists
    await supabase.auth.getUser();
  }

  if (issued) {
    response.cookies.set(GUEST_COOKIE, issued, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  // the payment webhook is machine-to-machine: no guest cookie, no auth refresh
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|cards/|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
