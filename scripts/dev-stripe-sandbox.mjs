// Real-Stripe sandbox harness.
//
// Runs `next dev` on :3002 against the Stripe sandbox the Stripe CLI is logged
// in to. API calls are relayed through the CLI (`stripe post` / `stripe get`)
// and webhooks arrive through `stripe listen`, so this script never reads,
// stores or prints an API key. It refuses to start unless the CLI is in test
// mode — no real money can move.
//
//   stripe login          (choose a sandbox)
//   node scripts/dev-stripe-sandbox.mjs
//
// Pay on the hosted checkout page with Stripe's test card 4242 4242 4242 4242.
import { spawn } from "node:child_process";
import path from "node:path";
import { cliWebhookSecret, redactSecrets, requireSandbox, startRelay, stripeSpawn } from "./lib/stripe-cli.mjs";

const RELAY_PORT = 4011;
const APP_PORT = 3002;
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];

let account;
let webhookSecret;
try {
  account = requireSandbox();
  webhookSecret = cliWebhookSecret();
} catch (err) {
  console.error(`[stripe-sandbox] ${err.message} Refusing to start.`);
  process.exit(1);
}
console.log(`[stripe-sandbox] using ${account.name} (${account.accountId}), test mode`);

const server = await startRelay(RELAY_PORT, (line) => console.log(`[stripe-sandbox] ${line}`));

const listen = stripeSpawn([
  "listen",
  "--forward-to",
  `http://localhost:${APP_PORT}/api/billing/webhook`,
  "--events",
  WEBHOOK_EVENTS.join(","),
]);
listen.stdout.on("data", (c) => process.stdout.write(redactSecrets(c)));
listen.stderr.on("data", (c) => process.stderr.write(redactSecrets(c)));

const next = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [next, "dev", "-p", String(APP_PORT)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // placeholder: the relay authenticates through the CLI, the app holds no key
    STRIPE_SECRET_KEY: "sk_test_relayed_by_stripe_cli",
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    STRIPE_API_BASE: `http://localhost:${RELAY_PORT}`,
  },
});
const stop = () => {
  app.kill();
  listen.kill();
  server.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", (code) => {
  listen.kill();
  server.close();
  process.exit(code ?? 0);
});
