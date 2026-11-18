/** The public address of the site, for canonical links, the sitemap and share previews. */
export function siteUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return process.env.NODE_ENV === "production" ? "https://arcana-intelligence.vercel.app" : "http://localhost:3000";
}

/** Pages a search engine may index. Everything personal (readings, payments, account) stays out. */
export const PUBLIC_PATHS = ["/", "/daily", "/cards", "/pricing", "/terms"] as const;
