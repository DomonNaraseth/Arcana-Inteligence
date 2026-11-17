/**
 * Opt-in check of the Stripe adapter against a real Stripe sandbox. Skipped by
 * `npm test`; it needs the Stripe CLI logged in to a sandbox and touches no
 * application database.
 *
 *   STRIPE_SANDBOX=1 npx vitest run tests/integration
 *
 * With STRIPE_SANDBOX_PAY_FILE=<path> the checkout URL is written to that file
 * and the run waits for someone to pay it with a Stripe test card, then checks
 * the session state and the real signed webhook for that very session.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebhookSignatureError, checkoutExpiry, type PaymentProvider } from "@/lib/billing/provider";
import { createStripeProvider } from "@/lib/billing/stripe";
import { cliWebhookSecret, requireSandbox, startRelay, stripeSpawn } from "../../scripts/lib/stripe-cli.mjs";

const RELAY_PORT = 4012;
const HOOK_PORT = 4013;
const PAY_FILE = process.env.STRIPE_SANDBOX_PAY_FILE;
const PAY_TIMEOUT_MS = 8 * 60_000;

interface Delivery {
  raw: string;
  signature: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!process.env.STRIPE_SANDBOX)("stripe adapter against a real sandbox", () => {
  let provider: PaymentProvider;
  let relay: Server;
  let hook: Server;
  let listener: ReturnType<typeof stripeSpawn>;
  const deliveries: Delivery[] = [];
  const paymentId = randomUUID();
  const expiresAt = checkoutExpiry();
  let sessionId = "";

  async function deliveryFor(match: (raw: string) => boolean, timeoutMs: number): Promise<Delivery> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = deliveries.find((d) => match(d.raw));
      if (found) return found;
      await sleep(500);
    }
    throw new Error("no matching webhook was delivered in time");
  }

  beforeAll(async () => {
    requireSandbox();
    process.env.STRIPE_API_BASE = `http://localhost:${RELAY_PORT}`;
    relay = await startRelay(RELAY_PORT);
    provider = createStripeProvider("sk_test_relayed_by_stripe_cli", cliWebhookSecret());

    hook = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        deliveries.push({ raw, signature: (req.headers["stripe-signature"] as string) ?? null });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((resolve) => hook.listen(HOOK_PORT, resolve));

    listener = stripeSpawn([
      "listen",
      "--forward-to",
      `http://localhost:${HOOK_PORT}/hook`,
      "--events",
      "checkout.session.completed",
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

  it("creates a hosted checkout for the server-side price", async () => {
    const created = await provider.createCheckout({
      paymentId,
      packageName: "Starter",
      credits: 20,
      amountMinor: 5900,
      currency: "thb",
      successUrl: "http://localhost:3002/account?payment=success",
      cancelUrl: "http://localhost:3002/account?payment=cancelled",
      expiresAt,
    });
    sessionId = created.sessionId;
    expect(created.sessionId).toMatch(/^cs_test_/);
    expect(new URL(created.url).host).toBe("checkout.stripe.com");
    if (PAY_FILE) writeFileSync(PAY_FILE, created.url, "utf8");

    const state = await provider.getSession(sessionId);
    expect(state).toMatchObject({
      sessionId,
      paymentId,
      paid: false,
      status: "open",
      amountMinor: 5900,
      currency: "thb",
    });
  }, 60_000);

  it("is idempotent: the same payment id returns the same session", async () => {
    const again = await provider.createCheckout({
      paymentId,
      packageName: "Starter",
      credits: 20,
      amountMinor: 5900,
      currency: "thb",
      successUrl: "http://localhost:3002/account?payment=success",
      cancelUrl: "http://localhost:3002/account?payment=cancelled",
      expiresAt,
    });
    expect(again.sessionId).toBe(sessionId);
  }, 60_000);

  it("reports an unknown session as a provider error", async () => {
    await expect(provider.getSession("cs_test_doesnotexist")).rejects.toThrow(/Stripe 404/);
  }, 60_000);

  it.skipIf(Boolean(PAY_FILE))(
    "verifies and maps a real signed webhook (stripe trigger)",
    async () => {
      const trigger = stripeSpawn(["trigger", "checkout.session.completed"]);
      await new Promise((resolve) => trigger.on("close", resolve));
      const delivery = await deliveryFor((raw) => raw.includes('"checkout.session.completed"'), 60_000);

      const event = provider.parseWebhook(delivery.raw, delivery.signature);
      expect(event.type).toBe("checkout.session.completed");
      expect(event.kind).toBe("paid");
      expect(event.session?.sessionId).toMatch(/^cs_test_/);
      expect(event.session?.paymentRef).toMatch(/^pi_/);

      expect(() => provider.parseWebhook(delivery.raw.replace('"paid"', '"unpaid"'), delivery.signature)).toThrow(
        WebhookSignatureError,
      );
    },
    120_000,
  );

  it.skipIf(!PAY_FILE)(
    "after a test-card payment: session is paid and its webhook verifies",
    async () => {
      const deadline = Date.now() + PAY_TIMEOUT_MS;
      let state = await provider.getSession(sessionId);
      while (!state.paid && Date.now() < deadline) {
        await sleep(4000);
        state = await provider.getSession(sessionId);
      }
      expect(state).toMatchObject({ paid: true, status: "complete", amountMinor: 5900, currency: "thb", paymentId });
      expect(state.paymentRef).toMatch(/^pi_/);

      const delivery = await deliveryFor((raw) => raw.includes(sessionId), 60_000);
      const event = provider.parseWebhook(delivery.raw, delivery.signature);
      expect(event.kind).toBe("paid");
      expect(event.session).toMatchObject({ sessionId, paymentId, paid: true, amountMinor: 5900, currency: "thb" });
    },
    PAY_TIMEOUT_MS + 90_000,
  );
});
