import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WebhookSignatureError, formatThb, toMinor } from "@/lib/billing/provider";
import {
  STRIPE_API_VERSION,
  createStripeProvider,
  encodeForm,
  mapStripeEvent,
  toInvoiceState,
  toSessionState,
  toSubscriptionState,
  verifyStripeSignature,
} from "@/lib/billing/stripe";

const SECRET = "whsec_unit_test_secret";
const sign = (body: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex")}`;

const session = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_abc123",
  status: "complete",
  payment_status: "paid",
  amount_total: 5900,
  currency: "thb",
  client_reference_id: "11111111-2222-3333-4444-555555555555",
  metadata: { payment_id: "11111111-2222-3333-4444-555555555555" },
  payment_intent: "pi_test_1",
  ...over,
});

describe("money helpers", () => {
  it("converts baht to satang without float drift", () => {
    expect(toMinor(59)).toBe(5900);
    expect(toMinor(149)).toBe(14900);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });

  it("formats satang as baht", () => {
    expect(formatThb(5900)).toBe("฿59");
    expect(formatThb(1999)).toBe("฿19.99");
  });
});

describe("stripe form encoding", () => {
  it("encodes nested objects and arrays the way Stripe expects", () => {
    const encoded = decodeURIComponent(
      encodeForm({
        mode: "payment",
        metadata: { payment_id: "p1" },
        line_items: [{ quantity: 1, price_data: { currency: "thb", unit_amount: 5900 } }],
        skipped: undefined,
      }),
    );
    expect(encoded).toContain("mode=payment");
    expect(encoded).toContain("metadata[payment_id]=p1");
    expect(encoded).toContain("line_items[0][quantity]=1");
    expect(encoded).toContain("line_items[0][price_data][unit_amount]=5900");
    expect(encoded).not.toContain("skipped");
  });
});

describe("webhook signature verification", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_800_000_000;

  it("accepts a correctly signed payload", () => {
    expect(() => verifyStripeSignature(body, sign(body, now), SECRET, now)).not.toThrow();
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    const header = `${sign(body, now)},v1=${"0".repeat(64)}`;
    expect(() => verifyStripeSignature(body, header, SECRET, now)).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const header = sign(body, now);
    const tampered = body.replace("evt_1", "evt_2");
    expect(() => verifyStripeSignature(tampered, header, SECRET, now)).toThrow(WebhookSignatureError);
  });

  it("rejects a signature made with another secret", () => {
    expect(() => verifyStripeSignature(body, sign(body, now, "whsec_attacker"), SECRET, now)).toThrow(
      WebhookSignatureError,
    );
  });

  it("rejects replays outside the tolerance window", () => {
    expect(() => verifyStripeSignature(body, sign(body, now - 301), SECRET, now)).toThrow(
      WebhookSignatureError,
    );
    expect(() => verifyStripeSignature(body, sign(body, now - 299), SECRET, now)).not.toThrow();
  });

  it("rejects missing or malformed headers", () => {
    expect(() => verifyStripeSignature(body, null, SECRET, now)).toThrow(WebhookSignatureError);
    expect(() => verifyStripeSignature(body, "garbage", SECRET, now)).toThrow(WebhookSignatureError);
    expect(() => verifyStripeSignature(body, `t=${now},v1=nothex`, SECRET, now)).toThrow(
      WebhookSignatureError,
    );
  });
});

describe("event mapping", () => {
  it("normalises a session", () => {
    expect(toSessionState(session())).toEqual({
      sessionId: "cs_test_abc123",
      paymentId: "11111111-2222-3333-4444-555555555555",
      paid: true,
      status: "complete",
      amountMinor: 5900,
      currency: "thb",
      paymentRef: "pi_test_1",
      mode: "payment",
      subscriptionId: null,
      customerId: null,
    });
  });

  it("treats a completed, paid session as paid", () => {
    const e = mapStripeEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: session() } });
    expect(e.kind).toBe("paid");
  });

  it("does not grant credits for a completed session that is not paid yet (delayed methods)", () => {
    const e = mapStripeEvent({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: session({ payment_status: "unpaid" }) },
    });
    expect(e.kind).toBe("ignored");
  });

  it("maps async success, async failure and expiry", () => {
    const of = (type: string, over = {}) =>
      mapStripeEvent({ id: "e", type, data: { object: session(over) } }).kind;
    expect(of("checkout.session.async_payment_succeeded", { payment_status: "paid" })).toBe("paid");
    expect(of("checkout.session.async_payment_failed", { payment_status: "unpaid" })).toBe("failed");
    expect(of("checkout.session.expired", { status: "expired", payment_status: "unpaid" })).toBe("expired");
  });

  it("ignores unrelated events", () => {
    expect(mapStripeEvent({ id: "e", type: "customer.created", data: { object: { id: "cus_1" } } }).kind).toBe(
      "ignored",
    );
    expect(mapStripeEvent({}).kind).toBe("ignored");
  });
});

describe("stripe provider", () => {
  it("detects test and live mode from the key", () => {
    expect(createStripeProvider("sk_test_x", null).livemode).toBe(false);
    expect(createStripeProvider("sk_live_x", null).livemode).toBe(true);
  });

  it("treats restricted keys the same way", () => {
    expect(createStripeProvider("rk_test_x", null).livemode).toBe(false);
    expect(createStripeProvider("rk_live_x", null).livemode).toBe(true);
  });

  it("pins the API version and leaves payment methods to the dashboard", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    }) as typeof fetch;
    try {
      const out = await createStripeProvider("rk_test_x", null).createCheckout({
        paymentId: "11111111-2222-3333-4444-555555555555",
        packageName: "Starter",
        credits: 20,
        amountMinor: 5900,
        currency: "thb",
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/no",
        expiresAt: 1_800_000_000,
      });
      expect(out.sessionId).toBe("cs_test_1");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["stripe-version"]).toBe(STRIPE_API_VERSION);
    expect(headers["idempotency-key"]).toBe("arcana-checkout-11111111-2222-3333-4444-555555555555");
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("mode")).toBe("payment");
    expect(form.get("integration_identifier")).toMatch(/^arcana-credits-[a-z]{8}$/);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("5900");
    expect(form.get("expires_at")).toBe("1800000000");
    expect([...form.keys()].some((k) => k.startsWith("payment_method_types"))).toBe(false);
  });

  it("refuses to parse webhooks when no signing secret is configured", () => {
    const p = createStripeProvider("sk_test_x", null);
    expect(p.webhookConfigured).toBe(false);
    expect(() => p.parseWebhook("{}", "t=1,v1=00")).toThrow(WebhookSignatureError);
  });

  it("parses a signed webhook end to end", () => {
    const p = createStripeProvider("sk_test_x", SECRET);
    const body = JSON.stringify({
      id: "evt_9",
      type: "checkout.session.completed",
      data: { object: session() },
    });
    const header = sign(body, Math.floor(Date.now() / 1000));
    const event = p.parseWebhook(body, header);
    expect(event.kind).toBe("paid");
    expect(event.session?.amountMinor).toBe(5900);
  });
});

describe("stripe memberships", () => {
  it("reads a subscription checkout: paid through an invoice, with subscription and customer", () => {
    const s = toSessionState({
      id: "cs_test_sub",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      amount_total: 14900,
      currency: "thb",
      client_reference_id: "11111111-2222-3333-4444-555555555555",
      payment_intent: null,
      invoice: "in_1",
      subscription: { id: "sub_1" },
      customer: "cus_1",
    });
    expect(s).toMatchObject({
      mode: "subscription",
      paid: true,
      paymentRef: "in_1",
      subscriptionId: "sub_1",
      customerId: "cus_1",
    });
    expect(toSessionState(session()).mode).toBe("payment");
  });

  it("finds the period end in both API shapes", () => {
    expect(toSubscriptionState({ id: "sub_1", status: "active", current_period_end: 1800 }).currentPeriodEnd).toBe(1800);
    expect(
      toSubscriptionState({ id: "sub_1", status: "active", items: { data: [{ current_period_end: 1900 }] } })
        .currentPeriodEnd,
    ).toBe(1900);
  });

  it("keeps access during payment retries and ends it when the provider gives up", () => {
    expect(toSubscriptionState({ id: "sub_1", status: "past_due" }).status).toBe("active");
    expect(toSubscriptionState({ id: "sub_1", status: "trialing" }).status).toBe("active");
    expect(toSubscriptionState({ id: "sub_1", status: "unpaid" }).status).toBe("canceled");
    expect(toSubscriptionState({ id: "sub_1", status: "incomplete" }).status).toBe("other");
  });

  it("treats a scheduled cancellation as cancel-at-period-end", () => {
    expect(toSubscriptionState({ id: "sub_1", status: "active", cancel_at_period_end: true }).cancelAtPeriodEnd).toBe(true);
    expect(toSubscriptionState({ id: "sub_1", status: "active", cancel_at: 1900 }).cancelAtPeriodEnd).toBe(true);
    expect(toSubscriptionState({ id: "sub_1", status: "active" }).cancelAtPeriodEnd).toBe(false);
  });

  it("finds the subscription of an invoice in both API shapes", () => {
    expect(toInvoiceState({ id: "in_1", subscription: "sub_1" }).subscriptionId).toBe("sub_1");
    expect(
      toInvoiceState({ id: "in_1", parent: { subscription_details: { subscription: "sub_2" } } }).subscriptionId,
    ).toBe("sub_2");
    expect(toInvoiceState({ id: "in_1" }).subscriptionId).toBeNull();
  });

  it("maps subscription lifecycle events", () => {
    const sub = { id: "sub_1", status: "active", customer: "cus_1", current_period_end: 1800 };
    const updated = mapStripeEvent({ id: "e1", type: "customer.subscription.updated", data: { object: sub } });
    expect(updated.kind).toBe("subscription_changed");
    expect(updated.subscription?.id).toBe("sub_1");
    const deleted = mapStripeEvent({ id: "e2", type: "customer.subscription.deleted", data: { object: sub } });
    expect(deleted.kind).toBe("subscription_ended");
    expect(deleted.subscription?.status).toBe("canceled");
    const incomplete = mapStripeEvent({
      id: "e3",
      type: "customer.subscription.updated",
      data: { object: { ...sub, status: "incomplete" } },
    });
    expect(incomplete.kind).toBe("ignored");
  });

  it("maps a paid subscription invoice and ignores one-off invoices", () => {
    const paid = mapStripeEvent({
      id: "e4",
      type: "invoice.paid",
      livemode: true,
      data: {
        object: { id: "in_9", subscription: "sub_1", amount_paid: 14900, currency: "thb", billing_reason: "subscription_cycle" },
      },
    });
    expect(paid).toMatchObject({ kind: "invoice_paid", livemode: true });
    expect(paid.invoice).toMatchObject({
      id: "in_9",
      subscriptionId: "sub_1",
      amountPaid: 14900,
      billingReason: "subscription_cycle",
    });
    expect(mapStripeEvent({ id: "e5", type: "invoice.paid", data: { object: { id: "in_10" } } }).kind).toBe("ignored");
  });

  it("takes credits back only for a full refund or a dispute", () => {
    const charge = { id: "ch_1", payment_intent: "pi_1", amount: 9900 };
    expect(
      mapStripeEvent({ id: "e6", type: "charge.refunded", data: { object: { ...charge, refunded: true } } }),
    ).toMatchObject({ kind: "refunded", paymentRef: "pi_1" });
    expect(
      mapStripeEvent({
        id: "e7",
        type: "charge.refunded",
        data: { object: { ...charge, refunded: false, amount_refunded: 100 } },
      }).kind,
    ).toBe("ignored");
    expect(
      mapStripeEvent({ id: "e8", type: "charge.dispute.created", data: { object: { id: "dp_1", payment_intent: "pi_1" } } }),
    ).toMatchObject({ kind: "disputed", paymentRef: "pi_1" });
  });
});
