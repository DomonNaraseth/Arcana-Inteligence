/**
 * First-party measurement helpers. Pure functions: they decide what a visit
 * is worth recording and reduce where it came from to a few coarse fields.
 * Nothing here keeps a full URL, an IP address or a user agent.
 */

export interface Touch {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer_host: string | null;
}

export type Device = "mobile" | "tablet" | "desktop";

const SIMPLE_PATHS = new Set([
  "/",
  "/home",
  "/daily",
  "/ask",
  "/history",
  "/journal",
  "/cards",
  "/pricing",
  "/account",
  "/terms",
  "/share/daily",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The page a visit is filed under, or null for pages that are not measured
 * (admin, API, auth). Personal ids in the path are replaced by a placeholder.
 */
export function trackedPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (SIMPLE_PATHS.has(path)) return path;
  const [, section, id, ...rest] = path.split("/");
  if (rest.length > 0 || !id) return null;
  if (section === "cards" && /^[a-z0-9-]{3,40}$/.test(id)) return `/cards/${id}`;
  if ((section === "reading" || section === "pay") && UUID.test(id)) return `/${section}/[id]`;
  return null;
}

/** Lowercase, no spaces, bounded — the naming rule for campaign tags. */
export function cleanTag(value: string | null | undefined, max = 100): string | null {
  const v = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9ก-๙._\-+]/g, "")
    .slice(0, max);
  return v || null;
}

const KNOWN_HOSTS: { test: RegExp; source: string; medium: string }[] = [
  { test: /(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, source: "google", medium: "organic" },
  { test: /(^|\.)bing\.com$/, source: "bing", medium: "organic" },
  { test: /(^|\.)duckduckgo\.com$/, source: "duckduckgo", medium: "organic" },
  { test: /(^|\.)yahoo\.com$/, source: "yahoo", medium: "organic" },
  { test: /(^|\.)(facebook\.com|fb\.com|messenger\.com)$/, source: "facebook", medium: "social" },
  { test: /(^|\.)instagram\.com$/, source: "instagram", medium: "social" },
  { test: /(^|\.)line\.me$|^jp\.naver\.line\.android$/, source: "line", medium: "social" },
  { test: /(^|\.)tiktok\.com$/, source: "tiktok", medium: "social" },
  { test: /(^|\.)(youtube\.com|youtu\.be)$/, source: "youtube", medium: "social" },
  { test: /^(t\.co|twitter\.com|x\.com)$|(^|\.)(twitter|x)\.com$/, source: "x", medium: "social" },
  { test: /(^|\.)threads\.net$/, source: "threads", medium: "social" },
  { test: /(^|\.)pantip\.com$/, source: "pantip", medium: "referral" },
];

function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol === "android-app:") return url.host.toLowerCase() || null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Where this visit came from, or null when it carries nothing new (an inside
 * link, or a visit typed in directly).
 */
export function attributeVisit(input: {
  search: string | null | undefined;
  referrer: string | null | undefined;
  /** this site's own hostname — links inside the site are not a source */
  ownHost: string;
}): Touch | null {
  const params = new URLSearchParams(input.search ?? "");
  const host = referrerHost(input.referrer);
  const own = input.ownHost.toLowerCase().replace(/^www\./, "");
  const external = host && host !== own ? host : null;

  const utmSource = cleanTag(params.get("utm_source"), 60);
  if (utmSource) {
    return {
      source: utmSource,
      medium: cleanTag(params.get("utm_medium"), 60),
      campaign: cleanTag(params.get("utm_campaign")),
      content: cleanTag(params.get("utm_content")),
      term: cleanTag(params.get("utm_term")),
      referrer_host: external,
    };
  }
  // ad click ids without tags: the network is known, the campaign is not
  if (params.get("gclid")) {
    return { source: "google", medium: "cpc", campaign: null, content: null, term: null, referrer_host: external };
  }
  if (params.get("fbclid")) {
    return { source: "facebook", medium: "social", campaign: null, content: null, term: null, referrer_host: external };
  }
  if (!external) return null;
  const known = KNOWN_HOSTS.find((k) => k.test.test(external));
  return {
    source: known?.source ?? external.slice(0, 60),
    medium: known?.medium ?? "referral",
    campaign: null,
    content: null,
    term: null,
    referrer_host: external,
  };
}

export function deviceClass(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Crawlers, link previews and headless browsers are not visitors. */
export function isBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? "";
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pagespeed|vercel/i.test(ua);
}

/** A campaign link with tags that follow the naming rule. */
export function buildTrackedUrl(
  base: string,
  tags: { source: string; medium: string; campaign: string; content?: string; term?: string },
): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  const entries: [string, string | null][] = [
    ["utm_source", cleanTag(tags.source, 60)],
    ["utm_medium", cleanTag(tags.medium, 60)],
    ["utm_campaign", cleanTag(tags.campaign)],
    ["utm_content", cleanTag(tags.content)],
    ["utm_term", cleanTag(tags.term)],
  ];
  if (!entries[0][1] || !entries[1][1] || !entries[2][1]) return null;
  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url.toString();
}
