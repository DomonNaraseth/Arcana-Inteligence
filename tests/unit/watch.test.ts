import { describe, expect, it } from "vitest";
import { hasNewTransfer, summarizeWaiting } from "@/lib/billing/watch";

const row = (over: Record<string, unknown> = {}) => ({
  provider: "promptpay",
  status: "pending",
  claim: { at: "2026-11-18T05:00:00.000Z", note: "โอนแล้ว" },
  amount_minor: 9900,
  package_name: "Starter",
  ...over,
});

describe("watching for reported transfers", () => {
  it("counts only PromptPay payments a customer reported and nobody has handled", () => {
    const summary = summarizeWaiting([
      row(),
      row({ claim: null }),
      row({ status: "paid" }),
      row({ status: "failed" }),
      row({ provider: "stripe" }),
      row({ claim: { at: "2026-11-18T06:30:00.000Z" }, amount_minor: 14900, package_name: "Plus (30 วัน)" }),
    ]);
    expect(summary.waiting).toBe(2);
    expect(summary.latestClaimAt).toBe("2026-11-18T06:30:00.000Z");
    expect(summary.newest).toEqual({
      amountMinor: 14900,
      packageName: "Plus (30 วัน)",
      claimedAt: "2026-11-18T06:30:00.000Z",
    });
  });

  it("is empty when nothing waits", () => {
    expect(summarizeWaiting([])).toEqual({ waiting: 0, latestClaimAt: null, newest: null });
    expect(summarizeWaiting([row({ status: "paid" })]).waiting).toBe(0);
  });

  it("alerts once per newly reported transfer", () => {
    const summary = summarizeWaiting([row()]);
    expect(hasNewTransfer(summary, null)).toBe(true);
    expect(hasNewTransfer(summary, "2026-11-18T04:00:00.000Z")).toBe(true);
    // the same transfer seen again on the next poll
    expect(hasNewTransfer(summary, summary.latestClaimAt)).toBe(false);
    // approving the newest leaves an older one: no new alert
    expect(hasNewTransfer(summary, "2026-11-18T06:30:00.000Z")).toBe(false);
    expect(hasNewTransfer(summarizeWaiting([]), null)).toBe(false);
  });
});
