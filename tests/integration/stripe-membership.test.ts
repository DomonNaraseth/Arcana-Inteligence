/**
 * Opt-in end-to-end check of a monthly membership: real Stripe sandbox (through
 * the Stripe CLI login) and the real database functions, driven through the
 * same service code the webhook route uses. It acts as a throwaway guest, so
 * it needs neither a signed-in account nor the credit system switched on, and
 * it leaves only test-mode rows behind.
 *
 *   STRIPE_SANDBOX=1 STRIPE_SANDBOX_PAY_FILE=<path> npx vitest run tests/integration/stripe-membership.test.ts
 *
 * The checkout URL is written to the file; pay it with the test card
 * 4242 4242 4242 4242 and the run continues by itself.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkoutExpiry, toMinor, type BillingEvent, type PaymentProvider } from "@/lib/billing/provider";
import { handleBillingEvent, planLabel, type MySubscription } from "@/lib/billing/service";
import { createStripeProvider } from "@/lib/billing/stripe";
import type { Wallet } from "@/lib/credits";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { GUEST_HEADER, SERVER_HEADER, getSystemClient } from "@/lib/supabase/server";
import {
  cliWebhookSecret,
  requireSandbox,
  startRelay,
  stripeSpawn,
  stripeSync,
} from "../../scripts/lib/stripe-cli.mjs";

const RELAY_PORT = 4014;
const HOOK_PORT = 4015;
const PAY_FILE = process.env.STRIPE_SANDBOX_PAY_FILE;
const PAY_TIMEOUT_MS = 8 * 60_000;
const settings = DEFAULT_SETTINGS;
const plan = settings.plans[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadEnvLocal() {
  const text = readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

describe.skipIf(!process.env.STRIPE_SANDBOX || !PAY_FILE)("monthly membership against a real sandbox", () => {
  let provider: PaymentProvider;
  let system: SupabaseClient;
  let guest: SupabaseClient;
  let relay: Server;
  let hook: Server;
  let listener: ReturnType<typeof stripeSpawn>;
  const events: BillingEvent[] = [];
  let cursor = 0;
  let paymentId = "";
  let sessionId = "";
  let subscriptionId = "";

  /** Waits for the next not-yet-consumed event that matches, and applies everything up to it. */
  async function applyUntil(match: (e: BillingEvent) => boolean, timeoutMs: number): Promise<BillingEvent> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (cursor < events.length) {
        const event = events[cursor++];
        if (event.kind !== "ignored") {
          const result = await handleBillingEvent(system, provider, event, settings);
          if (match(event)) {
            expect(result, `${event.type}: ${result.reason ?? ""}`).toMatchObject({ ok: true });
            return event;
          }
        }
      }
      await sleep(1000);
    }
    throw new Error("the expected provider event did not arrive in time");
  }

  const mySubscription = async () =>
    ((await guest.rpc("arcana_my_subscription")).data ?? null) as MySubscription | null;
  const myWallet = async () => (await guest.rpc("arcana_wallet")).data as Wallet;

  beforeAll(async () => {
    requireSandbox();
    loadEnvLocal();
    process.env.STRIPE_API_BASE = `http://localhost:${RELAY_PORT}`;
    relay = await startRelay(RELAY_PORT);
    provider = createStripeProvider("sk_test_relayed_by_stripe_cli", cliWebhookSecret());

    system = getSystemClient();
    guest = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          [SERVER_HEADER]: process.env.ARCANA_SERVER_SECRET ?? "",
          [GUEST_HEADER]: `g:${randomBytes(32).toString("hex")}`,
        },
      },
    });

    hook = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          // the real signature check and mapping, on real deliveries
          events.push(provider.parseWebhook(raw, (req.headers["stripe-signature"] as string) ?? null));
          res.writeHead(200).end("ok");
        } catch {
          res.writeHead(400).end("bad signature");
        }
      });
    });
    await new Promise<void>((resolve) => hook.listen(HOOK_PORT, resolve));

    listener = stripeSpawn([
      "listen",
      "--forward-to",
      `http://localhost:${HOOK_PORT}/hook`,
      "--events",
      "checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.paid",
    ]);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("stripe listen did not become ready")), 30_000);
      const onData = (chunk: Buffer) => {
        if (String(chunk).includes("Ready!")) {
          clearTimeout(timer);
          resolve();
        }
      };
      listener.stdout?.on("data", onData);
      listener.stderr?.on("data", onData);
    });
  }, 60_000);

  afterAll(() => {
    listener?.kill();
    hook?.close();
    relay?.close();
  });

  it("records the intent and opens a hosted subscription checkout", async () => {
    const created = await guest.rpc("arcana_create_subscription_payment", {
      p_provider: provider.id,
      p_plan_id: plan.id,
      p_plan_name: planLabel(plan.name),
      p_credits: plan.monthly_credits,
      p_amount_minor: toMinor(plan.price_thb),
      p_livemode: provider.livemode,
      p_allow_guest: true,
    });
    expect(created.error).toBeNull();
    paymentId = created.data as string;

    const session = await provider.createSubscriptionCheckout({
      paymentId,
      planId: plan.id,
      planName: plan.name,
      amountMinor: toMinor(plan.price_thb),
      currency: "thb",
      successUrl: "http://localhost:3002/account?payment=success",
      cancelUrl: "http://localhost:3002/pricing?payment=cancelled",
      expiresAt: checkoutExpiry(),
    });
    sessionId = session.sessionId;
    const attached = await guest.rpc("arcana_attach_payment_session", { p_id: paymentId, p_session_id: sessionId });
    expect(attached.data).toBe(true);

    const state = await provider.getSession(sessionId);
    expect(state).toMatchObject({ mode: "subscription", paid: false, amountMinor: toMinor(plan.price_thb), paymentId });
    expect((await mySubscription())?.active ?? false).toBe(false);
    writeFileSync(PAY_FILE!, session.url, "utf8");
  }, 120_000);

  it("after payment: the membership starts and the first month of credits arrives once", async () => {
    const paid = await applyUntil((e) => e.kind === "paid" && e.session?.sessionId === sessionId, PAY_TIMEOUT_MS);
    subscriptionId = paid.session?.subscriptionId ?? "";
    expect(subscriptionId).toMatch(/^sub_/);

    const sub = await mySubscription();
    expect(sub).toMatchObject({ tier: plan.id, active: true, source: "stripe", manageable: true });
    const wallet = await myWallet();
    expect(wallet.tier).toBe(plan.id);
    expect(wallet.balance).toBe(plan.monthly_credits);

    // the same event again, and the first invoice (delivered before or after the
    // checkout event), must not credit twice
    expect(await handleBillingEvent(system, provider, paid, settings)).toMatchObject({ ok: true });
    await sleep(5000);
    const firstInvoices = events.filter((e) => e.kind === "invoice_paid");
    expect(firstInvoices.length).toBeGreaterThan(0);
    for (const invoice of firstInvoices) {
      expect(invoice.invoice?.billingReason).toBe("subscription_create");
      expect(await handleBillingEvent(system, provider, invoice, settings)).toMatchObject({ ok: true });
    }
    expect((await myWallet()).balance).toBe(plan.monthly_credits);
  }, PAY_TIMEOUT_MS + 180_000);

  it("opens the billing portal for the member", async () => {
    const customer = await guest.rpc("arcana_my_billing_customer");
    expect(customer.data).toMatch(/^cus_/);
    const portal = await provider.createPortalSession(customer.data as string, "http://localhost:3002/account");
    expect(new URL(portal.url).host).toBe("billing.stripe.com");
  }, 120_000);

  // renewals are covered by stripe-renewal.test.ts, which advances a Stripe test clock

  it("a scheduled cancellation keeps access until the period ends", async () => {
    stripeSync(["post", `/v1/subscriptions/${subscriptionId}`, "-d", "cancel_at_period_end=true"]);
    await applyUntil((e) => e.kind === "subscription_changed" && e.subscription?.cancelAtPeriodEnd === true, 120_000);
    expect(await mySubscription()).toMatchObject({ active: true, cancel_at_period_end: true });
  }, 240_000);

  it("when the subscription ends the tier returns to free and the credits stay", async () => {
    stripeSync(["delete", `/v1/subscriptions/${subscriptionId}`, "--confirm"]);
    await applyUntil((e) => e.kind === "subscription_ended", 120_000);
    expect((await mySubscription())?.active).toBe(false);
    const wallet = await myWallet();
    expect(wallet.tier).toBe("free");
    expect(wallet.balance).toBe(plan.monthly_credits);
  }, 240_000);
});
