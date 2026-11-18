import type { MySubscription } from "./service";

export interface RenewalNotice {
  kind: "ending" | "ended";
  /** whole days until the end (0 = ends today); for "ended", days since */
  days: number;
  tier: MySubscription["tier"];
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_DAYS_BEFORE = 5;
export const REMIND_DAYS_AFTER = 7;

/**
 * A prepaid membership does not renew by itself, so its holder is reminded
 * shortly before it ends and for a week after. Recurring (card) memberships
 * and memberships set by an admin get no reminder.
 */
export function renewalNotice(sub: MySubscription | null, now = Date.now()): RenewalNotice | null {
  if (!sub || sub.source !== "prepaid" || sub.tier === "free" || !sub.current_period_end) return null;
  const end = Date.parse(sub.current_period_end);
  if (Number.isNaN(end)) return null;
  if (sub.active && end > now) {
    const days = Math.floor((end - now) / DAY_MS);
    return days < REMIND_DAYS_BEFORE ? { kind: "ending", days, tier: sub.tier } : null;
  }
  const since = Math.floor((now - end) / DAY_MS);
  return since >= 0 && since < REMIND_DAYS_AFTER ? { kind: "ended", days: since, tier: sub.tier } : null;
}
