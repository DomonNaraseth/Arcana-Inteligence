/**
 * Opt-in check of a membership renewal with a genuine `subscription_cycle`
 * invoice: a Stripe test clock is advanced by a month and the real webhook is
 * applied through the service code the webhook route uses. No browser needed.
 * The membership is set up directly in the database for a throwaway guest (the
 * checkout path is covered by stripe-membership.test.ts).
 *
 *   STRIPE_SANDBOX=1 npx vitest run tests/integration/stripe-renewal.test.ts
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toMinor, type BillingEvent, type PaymentProvider } from "@/lib/billing/provider";
import { handleBillingEvent, planLabel, type MySubscription } from "@/lib/billing/service";
import { STRIPE_API_VERSION, createStripeProvider } from "@/lib/billing/stripe";
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

const RELAY_PORT = 4016;
const HOOK_PORT = 4017;
const settings = DEFAULT_SETTINGS;
const plan = settings.plans[0];
const DAY = 24 * 60 * 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripeJson = (args: string[]) =>
  JSON.parse(stripeSync([...args, "--stripe-version", STRIPE_API_VERSION])) as Record<string, unknown>;

function loadEnvLocal() {
  const text = readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

describe.skipIf(!process.env.STRIPE_SANDBOX)("membership renewal against a real sandbox", () => {
  let provider: PaymentProvider;
  let system: SupabaseClient;
  let guest: SupabaseClient;
  let relay: Server;
  let hook: Server;
  let listener: ReturnType<typeof stripeSpawn>;
  const events: BillingEvent[] = [];
  let cursor = 0;
  let clockId = "";
  let subscriptionId = "";

  async function applyUntil(match: (e: BillingEvent) => boolean, timeoutMs: number): Promise<BillingEvent> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (cursor < events.length) {
        const event = events[cursor++];
        if (event.kind === "ignored") continue;
        const result = await handleBillingEvent(system, provider, event, settings);
        if (match(event)) {
          expect(result, `${event.type}: ${result.reason ?? ""}`).toMatchObject({ ok: true });
          return event;
        }
      }
      await sleep(1000);
    }
    throw new Error("the expected provider event did not arrive in time");
  }

  const myWallet = async () => (await guest.rpc("arcana_wallet")).data as Wallet;
  const mySubscription = async () =>
    ((await guest.rpc("arcana_my_subscription")).data ?? null) as MySubscription | null;

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
      "customer.subscription.updated,customer.subscription.deleted,invoice.paid",
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
    // deleting the clock removes its customer and subscription from the sandbox
    if (clockId) {
      try {
        stripeSync(["delete", `/v1/test_helpers/test_clocks/${clockId}`, "--confirm"]);
      } catch {
        // best effort
      }
    }
    listener?.kill();
    hook?.close();
    relay?.close();
  });

  it("sets up a paid membership on a test clock", async () => {
    const now = Math.floor(Date.now() / 1000);
    clockId = stripeJson(["post", "/v1/test_helpers/test_clocks", "-d", `frozen_time=${now}`]).id as string;
    const customer = stripeJson([
      "post",
      "/v1/customers",
      "-d",
      `test_clock=${clockId}`,
      "-d",
      "payment_method=pm_card_visa",
      "-d",
      "invoice_settings[default_payment_method]=pm_card_visa",
    ]).id as string;
    // make sure the plan's product exists (the adapter creates it on first checkout)
    try {
      stripeSync(["post", "/v1/products", "-d", `id=arcana_plan_${plan.id}`, "-d", `name=ARCANA ${plan.name}`]);
    } catch {
      // already there
    }
    const amount = toMinor(plan.price_thb);
    subscriptionId = stripeJson([
      "post",
      "/v1/subscriptions",
      "-d",
      `customer=${customer}`,
      "-d",
      "items[0][price_data][currency]=thb",
      "-d",
      `items[0][price_data][unit_amount]=${amount}`,
      "-d",
      "items[0][price_data][recurring][interval]=month",
      "-d",
      `items[0][price_data][product]=arcana_plan_${plan.id}`,
    ]).id as string;
    expect(subscriptionId).toMatch(/^sub_/);
    const state = await provider.getSubscription(subscriptionId);
    expect(state.status).toBe("active");

    // the same database steps a paid checkout goes through
    const created = await guest.rpc("arcana_create_subscription_payment", {
      p_provider: provider.id,
      p_plan_id: plan.id,
      p_plan_name: planLabel(plan.name),
      p_credits: plan.monthly_credits,
      p_amount_minor: amount,
      p_livemode: false,
      p_allow_guest: true,
    });
    expect(created.error).toBeNull();
    const paymentId = created.data as string;
    const sessionId = `cs_test_clock_${randomBytes(8).toString("hex")}`;
    expect((await guest.rpc("arcana_attach_payment_session", { p_id: paymentId, p_session_id: sessionId })).data).toBe(true);
    const fulfilled = await system.rpc("arcana_fulfill_payment", {
      p_id: paymentId,
      p_session_id: sessionId,
      p_amount_minor: amount,
      p_currency: "thb",
      p_payment_ref: `in_test_clock_${randomBytes(6).toString("hex")}`,
    });
    expect(fulfilled.data).toMatchObject({ ok: true, credited: plan.monthly_credits, kind: "subscription" });
    const activated = await system.rpc("arcana_activate_subscription", {
      p_payment_id: paymentId,
      p_subscription_id: subscriptionId,
      p_customer_id: customer,
      p_period_end: new Date((state.currentPeriodEnd ?? now + 30 * DAY) * 1000).toISOString(),
      p_cancel_at_period_end: false,
    });
    expect(activated.data).toMatchObject({ ok: true, tier: plan.id });
    expect((await myWallet()).balance).toBe(plan.monthly_credits);
  }, 180_000);

  it("a month later the renewal invoice grants the next month of credits, once", async () => {
    const before = await mySubscription();
    const target = Math.floor(Date.now() / 1000) + 32 * DAY;
    stripeSync(["post", `/v1/test_helpers/test_clocks/${clockId}/advance`, "-d", `frozen_time=${target}`]);

    const renewal = await applyUntil(
      (e) => e.kind === "invoice_paid" && e.invoice?.billingReason === "subscription_cycle",
      240_000,
    );
    expect(renewal.invoice).toMatchObject({ subscriptionId, amountPaid: toMinor(plan.price_thb), currency: "thb" });

    expect((await myWallet()).balance).toBe(plan.monthly_credits * 2);
    // the same invoice delivered again grants nothing more
    expect(await handleBillingEvent(system, provider, renewal, settings)).toMatchObject({ ok: true });
    expect((await myWallet()).balance).toBe(plan.monthly_credits * 2);

    const after = await mySubscription();
    expect(after?.active).toBe(true);
    expect(new Date(after!.current_period_end!).getTime()).toBeGreaterThan(
      new Date(before!.current_period_end!).getTime(),
    );
  }, 360_000);
});
