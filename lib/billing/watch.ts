/** What the admin payments page watches for: transfers customers say they made. */

export interface WaitingTransfer {
  amountMinor: number;
  packageName: string;
  claimedAt: string;
}

export interface WaitingSummary {
  /** PromptPay payments a customer reported and nobody has approved or rejected yet */
  waiting: number;
  latestClaimAt: string | null;
  newest: WaitingTransfer | null;
}

interface PaymentLike {
  provider?: string | null;
  status?: string | null;
  claim?: { at?: string | null } | null;
  amount_minor: number;
  package_name: string;
}

export function summarizeWaiting(rows: readonly PaymentLike[]): WaitingSummary {
  const waiting = rows
    .filter((p) => p.provider === "promptpay" && p.status === "pending" && p.claim?.at)
    .map((p) => ({ amountMinor: p.amount_minor, packageName: p.package_name, claimedAt: p.claim!.at! }))
    .sort((a, b) => Date.parse(b.claimedAt) - Date.parse(a.claimedAt));
  return { waiting: waiting.length, latestClaimAt: waiting[0]?.claimedAt ?? null, newest: waiting[0] ?? null };
}

/** True when a transfer was reported after the last one this browser already knows about. */
export function hasNewTransfer(summary: WaitingSummary, seenLatest: string | null): boolean {
  if (!summary.latestClaimAt) return false;
  if (!seenLatest) return true;
  return Date.parse(summary.latestClaimAt) > Date.parse(seenLatest);
}
