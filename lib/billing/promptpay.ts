import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import type { Settings } from "../settings";
import { checkThaiQr, thaiQrWithAmount } from "./thaiqr";

/**
 * PromptPay transfers to the owner's own account. There is no gateway: the
 * customer scans a QR that already carries the amount, transfers in their
 * banking app and uploads the slip (see ./slip.ts for how it is confirmed).
 */

export interface PromptPayConfig {
  /** digits only; null when only a shop QR is set */
  id: string | null;
  /** the shop's own static Thai QR (K SHOP, แม่มณี …); when set, customers pay the shop */
  merchantQr: string | null;
  accountName: string;
  receiverHint: string;
}

/** A mobile number (10 digits, leading 0), a national/tax id (13) or an e-wallet id (15). */
export function normalizePromptPayId(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits) || /^\d{13}$/.test(digits) || /^\d{15}$/.test(digits)) return digits;
  return null;
}

/**
 * The account customers pay to, or null when PromptPay is not set up. Outside
 * production a development id may stand in, so the flow can be exercised
 * without touching the live setting — no real account is implied by it.
 */
export function promptPayConfig(settings: Settings): PromptPayConfig | null {
  const s = settings.promptpay;
  const id = s.enabled ? normalizePromptPayId(s.id) : null;
  const merchantQr = s.enabled && checkThaiQr(s.merchant_qr).ok ? s.merchant_qr.trim() : null;
  if (id || merchantQr) {
    return { id, merchantQr, accountName: s.account_name.trim(), receiverHint: s.receiver_hint.trim() };
  }
  if (process.env.NODE_ENV !== "production") {
    const dev = normalizePromptPayId(process.env.ARCANA_DEV_PROMPTPAY_ID);
    if (dev) return { id: dev, merchantQr: null, accountName: "DEV ACCOUNT (not real)", receiverHint: "" };
  }
  return null;
}

/** The QR payload for one order: the shop's QR when set, else a PromptPay QR to the id. */
export function paymentPayload(config: PromptPayConfig, amountMinor: number): string {
  if (config.merchantQr) return thaiQrWithAmount(config.merchantQr, amountMinor);
  if (!config.id) throw new Error("PromptPay is not configured");
  return promptPayPayload(config.id, amountMinor);
}

/** EMVCo payload of a PromptPay QR for an exact amount (satang). */
export function promptPayPayload(id: string, amountMinor: number): string {
  if (!normalizePromptPayId(id)) throw new Error("invalid PromptPay id");
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("invalid amount");
  return generatePayload(id, { amount: amountMinor / 100 });
}

/** PNG data URL of the QR, sized for scanning from another phone's screen. */
export function promptPayQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** How a PromptPay id is shown to the payer: enough to recognise, not the whole number. */
export function maskPromptPayId(id: string): string {
  if (id.length === 10) return `${id.slice(0, 3)}-xxx-${id.slice(6)}`;
  return `${id.slice(0, 1)}-xxxx-xxxxx-${id.slice(-3, -1)}-${id.slice(-1)}`;
}
