import type { Orientation } from "./tarot/types";

/**
 * Sharing a daily card. A shared card says nothing about who drew it: the
 * link names only the card, its orientation and the day.
 */

export const SHARE_CHANNELS = ["native", "line", "facebook", "x", "copy", "download"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export interface SharedDaily {
  cardId: string;
  orientation: Orientation;
  /** YYYY-MM-DD, Bangkok calendar day */
  day: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Shared links stay viewable for about a year. */
const MAX_AGE_DAYS = 400;

/** Today's date in Bangkok as YYYY-MM-DD. */
export function bangkokDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
}

/**
 * Reads the share parameters, accepting only a known card, a valid orientation
 * and a real day that is not in the future and not too old.
 */
export function parseSharedDaily(
  params: { c?: string | null; o?: string | null; d?: string | null },
  knownCard: (id: string) => boolean,
  now = new Date(),
): SharedDaily | null {
  const cardId = params.c ?? "";
  const orientation = params.o === "reversed" ? "reversed" : params.o === "upright" ? "upright" : null;
  const day = params.d ?? "";
  if (!/^[a-z0-9-]{3,40}$/.test(cardId) || !knownCard(cardId) || !orientation) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = Date.parse(`${day}T00:00:00+07:00`);
  if (Number.isNaN(at) || new Date(at + 7 * 3600_000).toISOString().slice(0, 10) !== day) return null;
  const today = Date.parse(`${bangkokDay(now)}T00:00:00+07:00`);
  if (at > today || today - at > MAX_AGE_DAYS * DAY_MS) return null;
  return { cardId, orientation, day };
}

function query(s: SharedDaily): string {
  return new URLSearchParams({ c: s.cardId, o: s.orientation, d: s.day }).toString();
}

/** The public page for a shared card, tagged so visits from it are counted by channel. */
export function sharePageUrl(base: string, s: SharedDaily, channel: ShareChannel): string {
  const tags = new URLSearchParams({
    utm_source: channel === "native" || channel === "copy" || channel === "download" ? "share" : channel,
    utm_medium: "share",
    utm_campaign: "daily-card",
  });
  return `${base}/share/daily?${query(s)}&${tags.toString()}`;
}

export function shareImageUrl(base: string, s: SharedDaily, format: "story" | "og"): string {
  return `${base}/share/daily/image?${query(s)}&format=${format}`;
}

/** "18 พ.ย. 2569" for a YYYY-MM-DD day. */
export function thaiDayLabel(day: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(
    new Date(`${day}T12:00:00+07:00`),
  );
}

/** Shortens text at a word boundary, adding an ellipsis when it was cut. */
export function clipThai(text: string, max: number): string {
  if (text.length <= max) return text;
  if (typeof Intl.Segmenter !== "function") return `${text.slice(0, max - 1)}…`;
  let out = "";
  for (const { segment } of new Intl.Segmenter("th", { granularity: "word" }).segment(text)) {
    if ((out + segment).length > max - 1) break;
    out += segment;
  }
  return `${out.trimEnd()}…`;
}

/**
 * Inserts zero-width spaces between Thai words so an image renderer, which
 * only breaks lines at spaces, can wrap Thai text.
 */
export function breakableThai(text: string): string {
  if (typeof Intl.Segmenter !== "function") return text;
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return Array.from(segmenter.segment(text), (s) => s.segment).join("​");
}
