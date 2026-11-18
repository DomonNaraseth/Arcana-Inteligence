/**
 * Short operational notices to the owner (a customer reported a transfer, a
 * slip was confirmed). Sent to every channel that is configured through
 * environment variables; with none configured this does nothing.
 *
 * A notice never carries customer details — only what the owner needs to know
 * to go and look: amount, package, and a link to the admin page.
 */

export type NotifyChannel = "line" | "telegram";

export interface NotifyResult {
  channel: NotifyChannel;
  ok: boolean;
  detail: string;
}

const TIMEOUT_MS = 4000;

function lineConfig() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const to = process.env.LINE_ADMIN_USER_ID?.trim();
  return token && to ? { token, to } : null;
}

function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

export function notifyChannels(): NotifyChannel[] {
  const channels: NotifyChannel[] = [];
  if (lineConfig()) channels.push("line");
  if (telegramConfig()) channels.push("telegram");
  return channels;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.ok) return null;
    const text = await res.text().catch(() => "");
    return `HTTP ${res.status} ${text.slice(0, 160)}`;
  } catch (err) {
    return (err as Error).name === "AbortError" ? "timed out" : (err as Error).message;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the text to every configured channel. Never throws: a notice that
 * cannot be delivered must not fail the customer's request.
 */
export async function notifyAdmin(text: string): Promise<NotifyResult[]> {
  const message = text.slice(0, 1000);
  const jobs: Promise<NotifyResult>[] = [];

  const line = lineConfig();
  if (line) {
    jobs.push(
      post(
        "https://api.line.me/v2/bot/message/push",
        { authorization: `Bearer ${line.token}` },
        { to: line.to, messages: [{ type: "text", text: message }] },
      ).then((error) => ({ channel: "line" as const, ok: !error, detail: error ?? "sent" })),
    );
  }

  const telegram = telegramConfig();
  if (telegram) {
    jobs.push(
      post(
        `https://api.telegram.org/bot${telegram.token}/sendMessage`,
        {},
        { chat_id: telegram.chatId, text: message, disable_web_page_preview: true },
      ).then((error) => ({
        channel: "telegram" as const,
        ok: !error,
        // the bot token is part of the URL — never let it reach a log through an error
        detail: (error ?? "sent").split(telegram.token).join("…"),
      })),
    );
  }

  const results = await Promise.all(jobs);
  for (const r of results) {
    if (!r.ok) console.error(`[arcana] ${r.channel} notification failed:`, r.detail);
  }
  return results;
}
