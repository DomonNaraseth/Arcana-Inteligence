// PromptPay test harness.
//
// Runs `next dev` on :3003 with a made-up PromptPay id, so the payment page,
// the "I have transferred" notice and the admin approval can be exercised
// without touching the live PromptPay setting. Payments created by a
// development build are flagged as test and never count as revenue.
// Do not transfer money to the QR it shows — the id is not a real account.
//
//   node scripts/dev-promptpay.mjs
import { spawn } from "node:child_process";
import path from "node:path";

const APP_PORT = 3003;
const next = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [next, "dev", "-p", String(APP_PORT)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ARCANA_DEV_PROMPTPAY_ID: "0812345678",
    // memberships normally need a signed-in account; a dev build may test as a guest
    ARCANA_DEV_GUEST_SUBSCRIBE: "1",
  },
});
process.on("SIGINT", () => app.kill());
process.on("SIGTERM", () => app.kill());
app.on("exit", (code) => process.exit(code ?? 0));
