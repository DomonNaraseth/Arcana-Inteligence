// Automatic PromptPay (Beam) test harness — local only.
//
// Starts a mock of Beam's documented charges API on :4010 and `next dev` on
// :3004 pointed at it (BEAM_API_BASE is ignored by production builds). The
// mock issues a QR per charge, answers status lookups, and on
//   POST http://localhost:4010/mock/pay/<chargeId>
// marks the charge SUCCEEDED and sends the app a webhook signed exactly like
// Beam does (HMAC-SHA256 of the raw body, base64, X-Beam-Signature).
// Add ?webhook=0 to pay without a webhook (the pay page's polling must find it).
// Card payments: the app's card button opens a mock hosted checkout on :4010
// whose "Pay with test card" marks the link PAID, sends a signed
// payment_link.paid webhook and redirects back to the pay page.
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
const links = new Map();

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
    // ── card checkout (payment links) ──
    if (req.method === "POST" && url.pathname === "/api/v1/payment-links") {
      if (!req.headers.authorization?.startsWith("Basic ")) return send(res, 401, { error: "auth" });
      const body = JSON.parse(await readBody(req));
      const id = `pl${randomBytes(5).toString("hex")}`;
      links.set(id, { ...body, id, status: "ACTIVE" });
      console.log(`[mock-beam] card link ${id} ${body.order.netAmount} for ${body.order.referenceId}`);
      return send(res, 200, { id, url: `http://localhost:${MOCK_PORT}/checkout/${id}` });
    }
    const getLink = url.pathname.match(/^\/api\/v1\/payment-links\/([\w-]+)$/);
    if (req.method === "GET" && getLink) {
      const l = links.get(getLink[1]);
      if (!l) return send(res, 404, { error: "not found" });
      return send(res, 200, { paymentLinkId: l.id, merchantId: "m_mock", status: l.status, order: l.order });
    }
    // the hosted page a shopper would see (mock): one button that pays
    const page = url.pathname.match(/^\/checkout\/([\w-]+)$/);
    if (req.method === "GET" && page) {
      const l = links.get(page[1]);
      if (!l) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:2rem">
<h1>MOCK Beam card checkout</h1><p>${l.order.description} — ${(l.order.netAmount / 100).toFixed(2)} THB</p>
<form method=post action="/checkout/${l.id}/pay"><button style="font-size:1.2rem;padding:.6rem 1.2rem">Pay with test card</button></form></body>`);
    }
    const payPage = url.pathname.match(/^\/checkout\/([\w-]+)\/pay$/);
    if (req.method === "POST" && payPage) {
      const l = links.get(payPage[1]);
      if (!l) return send(res, 404, { error: "not found" });
      l.status = "PAID";
      const raw = JSON.stringify({ paymentLinkId: l.id, merchantId: "m_mock", url: "", status: "PAID", order: l.order });
      const signature = createHmac("sha256", Buffer.from(KEY, "base64")).update(raw).digest("base64");
      const hook = await fetch(`http://localhost:${APP_PORT}/api/billing/beam/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-beam-signature": signature, "x-beam-event": "payment_link.paid" },
        body: raw,
      }).catch((e) => ({ status: `unreachable: ${e.message}` }));
      console.log(`[mock-beam] card link paid ${l.id} → webhook ${hook.status}`);
      res.writeHead(303, { location: l.redirectUrl });
      return res.end();
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
