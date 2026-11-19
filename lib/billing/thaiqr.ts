/**
 * Thai QR Payment (EMVCo) for a shop's own QR — K SHOP, แม่มณี or any bank
 * merchant QR. The owner gives us the shop's static QR (no amount); for each
 * order we add the exact amount and recompute the checksum. Everything else in
 * the QR — the biller id and the shop's references — stays exactly as the bank
 * issued it, so the money still goes to the shop and the payer's banking app
 * shows the shop's name. Browser-safe: used by Admin → Settings to preview.
 */

export interface Tlv {
  tag: string;
  value: string;
}

/** PromptPay application ids inside tag 29 (credit transfer) and tag 30 (bill payment) */
const AID_TRANSFER = "A000000677010111";
const AID_BILL = "A000000677010112";

export interface ThaiQrInfo {
  /** bill payment = a shop / merchant QR; transfer = a personal PromptPay QR */
  kind: "bill" | "transfer";
  /** the biller id or PromptPay id, partly hidden */
  maskedId: string;
  /** the merchant name the QR carries (tag 59), if any */
  merchantName: string | null;
}

export type ThaiQrCheck = { ok: true; info: ThaiQrInfo } | { ok: false; reason: string };

export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Splits an EMVCo payload into tag–length–value fields; null when it does not parse. */
export function parseTlv(payload: string): Tlv[] | null {
  const out: Tlv[] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len)) return null;
    const value = payload.slice(i + 4, i + 4 + Number(len));
    if (value.length !== Number(len)) return null;
    out.push({ tag, value });
    i += 4 + Number(len);
  }
  return out;
}

const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

function mask(id: string): string {
  if (id.length <= 6) return id;
  return `${id.slice(0, 3)}${"x".repeat(id.length - 7)}${id.slice(-4)}`;
}

/** Checks a shop QR the owner pasted or uploaded. Reasons are Thai, for the admin. */
export function checkThaiQr(raw: string | null | undefined): ThaiQrCheck {
  const payload = (raw ?? "").trim();
  if (!payload) return { ok: false, reason: "ยังไม่ได้ใส่ QR ร้านค้า" };
  if (!payload.startsWith("000201")) return { ok: false, reason: "ข้อความนี้ไม่ใช่ QR ชำระเงินมาตรฐาน Thai QR" };
  const fields = parseTlv(payload);
  const last = fields?.at(-1);
  if (!fields || last?.tag !== "63" || last.value.length !== 4) {
    return { ok: false, reason: "อ่าน QR ไม่ครบ — ลองอัปโหลดภาพ QR ที่ชัดกว่านี้" };
  }
  if (crc16(payload.slice(0, -4)) !== last.value.toUpperCase()) {
    return { ok: false, reason: "รหัสตรวจสอบของ QR ไม่ตรง — ข้อความอาจถูกตัดหรือแก้ไข" };
  }
  const get = (tag: string) => fields.find((f) => f.tag === tag)?.value;
  if (get("53") !== "764") return { ok: false, reason: "QR นี้ไม่ได้รับเงินบาท" };
  if (get("54")) {
    return { ok: false, reason: "QR นี้ระบุยอดเงินไว้แล้ว — ใช้ QR ร้านแบบไม่ระบุยอด (QR ประจำร้าน) ระบบจะใส่ยอดให้เองทุกรายการ" };
  }

  const bill = get("30");
  const transfer = get("29");
  const sub = parseTlv(bill ?? transfer ?? "");
  const subGet = (tag: string) => sub?.find((f) => f.tag === tag)?.value;
  if (bill && subGet("00") === AID_BILL && subGet("01")) {
    return { ok: true, info: { kind: "bill", maskedId: mask(subGet("01")!), merchantName: get("59")?.trim() || null } };
  }
  if (transfer && subGet("00") === AID_TRANSFER) {
    const id = subGet("01") ?? subGet("02") ?? subGet("03") ?? "";
    if (id) return { ok: true, info: { kind: "transfer", maskedId: mask(id), merchantName: get("59")?.trim() || null } };
  }
  return { ok: false, reason: "ไม่พบข้อมูลพร้อมเพย์ใน QR นี้ — ใช้ QR รับเงินจากแอปธนาคารหรือแอปร้านค้า" };
}

/**
 * The shop's QR for one exact amount (satang): a one-time QR (point of
 * initiation 12) with the amount in tag 54 and a fresh checksum. Throws when
 * the QR does not pass checkThaiQr — never pays to anything it cannot read.
 */
export function thaiQrWithAmount(raw: string, amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("invalid amount");
  const payload = raw.trim();
  const checked = checkThaiQr(payload);
  if (!checked.ok) throw new Error(`invalid shop QR: ${checked.reason}`);
  const fields = parseTlv(payload)!.filter((f) => f.tag !== "63" && f.tag !== "54");
  const amount = { tag: "54", value: (amountMinor / 100).toFixed(2) };
  // right after the currency, where bank and library QRs put it
  const currency = fields.findIndex((f) => f.tag === "53");
  const later = fields.findIndex((f) => Number(f.tag) > 54);
  fields.splice(currency !== -1 ? currency + 1 : later === -1 ? fields.length : later, 0, amount);
  const body = fields.map((f) => field(f.tag, f.tag === "01" ? "12" : f.value)).join("") + "6304";
  return body + crc16(body);
}
