import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const GUEST_COOKIE = "arcana_key";
export const GUEST_HEADER = "x-arcana-key";
export const SERVER_HEADER = "x-arcana-server";
export const ADMIN_COOKIE = "arcana_admin";
export const ADMIN_HEADER = "x-arcana-admin";

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.ARCANA_SERVER_SECRET,
  );
}

export interface RequestContext {
  supabase: SupabaseClient;
  /** "u:<auth uid>" for signed-in users, "g:<token>" for guest sessions */
  userKey: string;
  user: User | null;
  isGuest: boolean;
}

/**
 * Per-request context. Every table is protected by RLS keyed on
 * arcana_user_key(): the auth uid when signed in, otherwise the secret guest
 * token forwarded from an httpOnly cookie in the x-arcana-key header.
 */
export async function getContext(): Promise<RequestContext> {
  if (!supabaseConfigured()) {
    throw new ConfigError("Supabase is not configured");
  }
  const cookieStore = await cookies();
  const guestKey = cookieStore.get(GUEST_COOKIE)?.value;
  const adminKey = cookieStore.get(ADMIN_COOKIE)?.value;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options?: CookieOptions }[]) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — middleware refreshes sessions
          }
        },
      },
      global: {
        headers: {
          // proves to the database that the request comes from this server;
          // RLS rejects every arcana_* query without it
          [SERVER_HEADER]: process.env.ARCANA_SERVER_SECRET ?? "",
          ...(guestKey?.startsWith("g:") ? { [GUEST_HEADER]: guestKey } : {}),
          // operator session (set by /api/admin/session); verified in SQL
          ...(adminKey ? { [ADMIN_HEADER]: adminKey } : {}),
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userKey = user ? `u:${user.id}` : guestKey;
  if (!userKey) {
    throw new ConfigError("No session — cookies appear to be disabled");
  }
  return { supabase, userKey, user, isGuest: !user };
}

export class ConfigError extends Error {}
