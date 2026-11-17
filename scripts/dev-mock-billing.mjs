// Local payment test harness.
//
// Starts a tiny in-memory stand-in for the Stripe Checkout API on :4010 and
// then runs `next dev` on :3001 pointed at it, with mock (non-secret) keys.
// Nothing here talks to Stripe and no real money can move. The app only
// honours STRIPE_API_BASE outside production.
//
//   node scripts/dev-mock-billing.mjs
//
// Test controls on the mock:
//   POST /__mock/pay/<session id>      mark a session as paid
//   POST /__mock/expire/<session id>   mark a session as expired
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";

const MOCK_PORT = 4010;
const APP_PORT = 3001;
export const MOCK_WEBHOOK_SECRET = "whsec_local_mock_only";

const sessions = new Map();
let counter = 0;

function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);

    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      if (!(req.headers.authorization ?? "").startsWith("Bearer sk_test_")) {
        return send(401, { error: { message: "Invalid API Key provided" } });
      }
      const f = parseForm(body);
      const id = `cs_test_mock_${++counter}_${Date.now()}`;
      const session = {
        id,
        object: "checkout.session",
        url: `http://localhost:${MOCK_PORT}/pay/${id}`,
        status: "open",
        payment_status: "unpaid",
        amount_total: Number(f["line_items[0][price_data][unit_amount]"]),
        currency: f["line_items[0][price_data][currency]"],
        client_reference_id: f.client_reference_id,
        metadata: { payment_id: f["metadata[payment_id]"] },
        payment_intent: `pi_test_mock_${counter}`,
        success_url: f.success_url,
        cancel_url: f.cancel_url,
      };
      sessions.set(id, session);
      return send(200, session);
    }

    const get = url.pathname.match(/^\/v1\/checkout\/sessions\/([A-Za-z0-9_]+)$/);
    if (req.method === "GET" && get) {
      const s = sessions.get(get[1]);
      return s ? send(200, s) : send(404, { error: { message: "No such checkout.session" } });
    }

    const control = url.pathname.match(/^\/__mock\/(pay|expire)\/([A-Za-z0-9_]+)$/);
    if (req.method === "POST" && control) {
      const s = sessions.get(control[2]);
      if (!s) return send(404, { error: { message: "unknown session" } });
      if (control[1] === "pay") Object.assign(s, { status: "complete", payment_status: "paid" });
      else Object.assign(s, { status: "expired", payment_status: "unpaid" });
      return send(200, s);
    }

    send(404, { error: { message: `mock: no route ${req.method} ${url.pathname}` } });
  });
});

server.listen(MOCK_PORT, () => {
  console.log(`[mock-billing] fake Stripe API on http://localhost:${MOCK_PORT}`);
  const next = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "dev", "-p", String(APP_PORT)], {
    stdio: "inherit",
    env: {
      ...process.env,
      STRIPE_SECRET_KEY: "sk_test_local_mock_only",
      STRIPE_WEBHOOK_SECRET: MOCK_WEBHOOK_SECRET,
      STRIPE_API_BASE: `http://localhost:${MOCK_PORT}`,
    },
  });
  const stop = () => {
    child.kill();
    server.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => {
    server.close();
    process.exit(code ?? 0);
  });
});
