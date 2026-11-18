// Automatic PromptPay (Beam) test harness — local only.
//
// Starts a mock of Beam's documented charges API on :4010 and `next dev` on
// :3004 pointed at it (BEAM_API_BASE is ignored by production builds). The
// mock issues a QR per charge, answers status lookups, and on
//   POST http://localhost:4010/mock/pay/<chargeId>
// marks the charge SUCCEEDED and sends the app a webhook signed exactly like
// Beam does (HMAC-SHA256 of the raw body, base64, X-Beam-Signature).
// Add ?webhook=0 to pay without a webhook (the pay page's polling must find it).
// Payments made by a development build are flagged as test, never revenue.
// Do not pay the QR it shows: it is not a real PromptPay code.
//
//   node scripts/dev-beam.mjs
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import path from "node:path";
import QRCode from "qrcode";

const MOCK_PORT = 4010;
const APP_PORT = 3004;
const KEY = randomBytes(32).toString("base64");
const charges = new Map();

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
    if (req.method === "POST" && url.pathname === "/api/v1/charges") {
      if (!req.headers.authorization?.startsWith("Basic ")) return send(res, 401, { error: "auth" });
      const body = JSON.parse(await readBody(req));
      if (body?.paymentMethod?.paymentMethodType !== "QR_PROMPT_PAY") return send(res, 400, { error: "method" });
      const chargeId = `ch_mock${randomBytes(8).toString("hex")}`;
      const png = await QRCode.toDataURL(`MOCK-BEAM ${chargeId} ${body.amount}`, { width: 480, margin: 2 });
      charges.set(chargeId, { chargeId, referenceId: body.referenceId, status: "PENDING", amount: body.amount, currency: body.currency });
      console.log(`[mock-beam] charge ${chargeId} ${body.amount} for ${body.referenceId}`);
      return send(res, 200, {
        actionRequired: "ENCODED_IMAGE",
        chargeId,
        encodedImage: { expiry: body.paymentMethod.qrPromptPay.expiryTime, imageBase64Encoded: png.split(",")[1], rawData: "mock" },
        paymentMethodType: "QR_PROMPT_PAY",
      });
    }
    const get = url.pathname.match(/^\/api\/v1\/charges\/([\w-]+)$/);
    if (req.method === "GET" && get) {
      const c = charges.get(get[1]);
      return c ? send(res, 200, { ...c, merchantId: "m_mock" }) : send(res, 404, { error: "not found" });
    }
    const pay = url.pathname.match(/^\/mock\/pay\/([\w-]+)$/);
    if (req.method === "POST" && pay) {
      const c = charges.get(pay[1]);
      if (!c) return send(res, 404, { error: "not found" });
      c.status = "SUCCEEDED";
      // ?webhook=0 — pay without a webhook, so the pay page's own status check has to find it
      if (url.searchParams.get("webhook") === "0") {
        console.log(`[mock-beam] paid ${c.chargeId} (no webhook)`);
        return send(res, 200, { paid: c.chargeId, webhook: "skipped" });
      }
      const raw = JSON.stringify({ ...c, merchantId: "m_mock", source: "API", paymentMethod: { paymentMethodType: "QR_PROMPT_PAY" } });
      const signature = createHmac("sha256", Buffer.from(KEY, "base64")).update(raw).digest("base64");
      const hook = await fetch(`http://localhost:${APP_PORT}/api/billing/beam/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-beam-signature": signature, "x-beam-event": "charge.succeeded" },
        body: raw,
      }).catch((e) => ({ status: `unreachable: ${e.message}` }));
      console.log(`[mock-beam] paid ${c.chargeId} → webhook ${hook.status}`);
      return send(res, 200, { paid: c.chargeId, webhook: hook.status });
    }
    send(res, 404, { error: "unknown" });
  })
  .listen(MOCK_PORT, () => console.log(`[mock-beam] listening on :${MOCK_PORT}`));

const next = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [next, "dev", "-p", String(APP_PORT)], {
  stdio: "inherit",
  env: {
    ...process.env,
    BEAM_MERCHANT_ID: "m_mock",
    BEAM_API_KEY: "mock-key",
    BEAM_WEBHOOK_KEY: KEY,
    // "production" here only means: offered to every visitor of this dev build
    BEAM_ENV: "production",
    BEAM_API_BASE: `http://localhost:${MOCK_PORT}`,
  },
});
process.on("SIGINT", () => app.kill());
process.on("SIGTERM", () => app.kill());
app.on("exit", (code) => process.exit(code ?? 0));
