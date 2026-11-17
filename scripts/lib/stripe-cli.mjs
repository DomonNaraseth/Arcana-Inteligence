// Helpers for talking to a Stripe sandbox through the Stripe CLI's own login,
// so development tooling never reads, stores or prints an API key.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

/** The npm wrapper is a .cmd on Windows, which node cannot spawn without a shell. */
function command() {
  const shim = process.env.APPDATA
    ? path.join(process.env.APPDATA, "npm", "node_modules", "@stripe", "cli", "bin", "shim.js")
    : "";
  return shim && existsSync(shim) ? { cmd: process.execPath, pre: [shim] } : { cmd: "stripe", pre: [] };
}
const { cmd, pre } = command();

export const redactSecrets = (text) => String(text).replace(/whsec_[A-Za-z0-9]+/g, "whsec_…");

export function stripeSync(args) {
  return execFileSync(cmd, [...pre, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function stripeSpawn(args, options = {}) {
  return spawn(cmd, [...pre, ...args], { stdio: ["ignore", "pipe", "pipe"], ...options });
}

/** Throws unless the CLI is logged in to a sandbox: tooling must never reach live mode. */
export function requireSandbox() {
  let who;
  try {
    who = JSON.parse(stripeSync(["whoami", "--format", "json"]));
  } catch {
    throw new Error("Stripe CLI is not installed or not logged in. Run: stripe login");
  }
  if (!who.authorized || who.mode !== "test") {
    throw new Error("The Stripe CLI must be logged in to a sandbox (test mode).");
  }
  return { accountId: who.account_id, name: who.display_name };
}

/** Signing secret of the events `stripe listen` forwards. Treat as a secret. */
export function cliWebhookSecret() {
  const secret = stripeSync(["listen", "--print-secret"]).trim();
  if (!secret.startsWith("whsec_")) throw new Error("could not obtain the CLI webhook signing secret");
  return secret;
}

function relay(method, target, headers, body) {
  return new Promise((resolve) => {
    const args = [method.toLowerCase(), target];
    if (headers["stripe-version"]) args.push("--stripe-version", String(headers["stripe-version"]));
    if (headers["idempotency-key"]) args.push("--idempotency", String(headers["idempotency-key"]));
    for (const [k, v] of new URLSearchParams(body)) args.push("-d", `${k}=${v}`);
    const child = stripeSpawn(args);
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("close", () => {
      let json;
      try {
        json = JSON.parse(out);
      } catch {
        return resolve({ status: 502, json: { error: { message: "relay: unreadable CLI output" } } });
      }
      if (!json.error) return resolve({ status: 200, json });
      const type = json.error.type;
      const status =
        json.error.code === "resource_missing"
          ? 404
          : type === "invalid_request_error" || type === "idempotency_error"
            ? 400
            : 502;
      resolve({ status, json });
    });
  });
}

/**
 * Local stand-in for https://api.stripe.com that forwards each request with
 * `stripe get` / `stripe post`. Point STRIPE_API_BASE at it (dev only).
 */
export function startRelay(port, log = () => {}) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const send = (status, json) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (!req.url?.startsWith("/v1/") || !["GET", "POST"].includes(req.method ?? "")) {
        return send(404, { error: { message: `relay: no route ${req.method} ${req.url}` } });
      }
      const { status, json } = await relay(req.method, req.url, req.headers, body);
      log(`${req.method} ${req.url.split("?")[0]} → ${status}`);
      send(status, json);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
