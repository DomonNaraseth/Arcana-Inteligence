/**
 * A production deployment answers on several hostnames (the production domain,
 * a per-branch alias, a per-deployment URL). Sessions, the guest cookie and the
 * OAuth return address are all bound to a hostname, and the auth provider only
 * allows the production domain — so every other hostname is sent there before
 * anything else happens.
 *
 * Returns the URL to redirect to, or null when the request is already on the
 * production domain (or this is not a production deployment).
 */
export function canonicalRedirect(input: {
  host: string | null;
  pathAndQuery: string;
  method: string;
  /** VERCEL_ENV */
  vercelEnv?: string;
  /** VERCEL_PROJECT_PRODUCTION_URL — hostname without scheme */
  productionHost?: string;
}): string | null {
  const canonical = input.productionHost?.trim().toLowerCase();
  if (input.vercelEnv !== "production" || !canonical) return null;
  // only navigations: a redirected POST would lose its body
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const host = input.host?.trim().toLowerCase().replace(/:\d+$/, "");
  if (!host || host === canonical) return null;
  const path = input.pathAndQuery.startsWith("/") ? input.pathAndQuery : `/${input.pathAndQuery}`;
  return `https://${canonical}${path}`;
}
