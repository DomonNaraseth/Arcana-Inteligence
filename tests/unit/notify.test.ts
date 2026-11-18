import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyAdmin, notifyChannels } from "@/lib/notify";

const KEYS = ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_ADMIN_USER_ID", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const;

describe("owner notifications", () => {
  const saved: Record<string, string | undefined> = {};
  const calls: { url: string; init: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  let respond: (url: string) => Response;

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    calls.length = 0;
    respond = () => new Response("{}", { status: 200 });
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(url);
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("does nothing when no channel is configured", async () => {
    expect(notifyChannels()).toEqual([]);
    expect(await notifyAdmin("hello")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("needs both values of a channel before using it", () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token-only";
    process.env.TELEGRAM_CHAT_ID = "123";
    expect(notifyChannels()).toEqual([]);
  });

  it("pushes a LINE text message to the owner", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.LINE_ADMIN_USER_ID = "Uabc";
    expect(notifyChannels()).toEqual(["line"]);
    const results = await notifyAdmin("มีลูกค้าแจ้งโอน ฿99");
    expect(results).toEqual([{ channel: "line", ok: true, detail: "sent" }]);
    expect(calls[0].url).toBe("https://api.line.me/v2/bot/message/push");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer line-token");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      to: "Uabc",
      messages: [{ type: "text", text: "มีลูกค้าแจ้งโอน ฿99" }],
    });
  });

  it("sends through Telegram and through both when both are set", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    process.env.TELEGRAM_CHAT_ID = "42";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.LINE_ADMIN_USER_ID = "Uabc";
    const results = await notifyAdmin("hello");
    expect(results.map((r) => r.channel).sort()).toEqual(["line", "telegram"]);
    const telegram = calls.find((c) => c.url.includes("api.telegram.org"));
    expect(telegram?.url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(String(telegram?.init.body))).toMatchObject({ chat_id: "42", text: "hello" });
  });

  it("reports a failure without throwing and without leaking the bot token", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:SECRET";
    process.env.TELEGRAM_CHAT_ID = "42";
    respond = () => new Response("bad token 123:SECRET", { status: 401 });
    const results = await notifyAdmin("hello");
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toContain("401");
    expect(results[0].detail).not.toContain("SECRET");
  });

  it("survives a network error", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.LINE_ADMIN_USER_ID = "Uabc";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const results = await notifyAdmin("hello");
    expect(results).toEqual([{ channel: "line", ok: false, detail: "network down" }]);
  });
});
