/**
 * Confirms a bank-transfer slip with a slip-verification service. The service
 * reads the slip's own QR and asks the banking network whether that transfer
 * really happened, so an edited image cannot pass. Our own checks (amount,
 * time, recipient hint, one payment per transfer) run on top of its answer.
 */

export interface SlipResult {
  /** the banking network's reference of the transfer — unique per transfer */
  transRef: string;
  amountMinor: number;
  /** ISO timestamp of the transfer */
  transferredAt: string;
  /** recipient names and masked numbers as printed on the slip, for the hint check */
  receiverText: string;
}

export type SlipFailure =
  | "unreadable"
  | "amount_mismatch"
  | "wrong_receiver"
  | "slip_used"
  | "slip_too_old"
  | "bank_delay"
  | "unavailable";

export class SlipError extends Error {
  constructor(
    public reason: SlipFailure,
    message: string,
  ) {
    super(message);
  }
}

export const SLIP_FAILURE_TH: Record<SlipFailure, string> = {
  unreadable: "อ่านสลิปไม่ได้ กรุณาใช้ภาพสลิปต้นฉบับจากแอปธนาคารที่เห็น QR ชัดเจน",
  amount_mismatch: "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ กรุณาตรวจสอบยอดโอน",
  wrong_receiver: "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของร้าน กรุณาตรวจสอบว่าโอนถูกบัญชี",
  slip_used: "สลิปนี้ถูกใช้ไปแล้ว หนึ่งสลิปใช้ได้กับหนึ่งรายการเท่านั้น",
  slip_too_old: "สลิปนี้เป็นการโอนก่อนสร้างรายการนี้ กรุณาใช้สลิปของการโอนครั้งนี้",
  bank_delay: "ธนาคารยังไม่ส่งข้อมูลการโอนนี้เข้าระบบ กรุณารอสักครู่แล้วลองอีกครั้ง",
  unavailable: "ระบบตรวจสลิปขัดข้องชั่วคราว กรุณาลองใหม่ หรือกดแจ้งโอนให้ผู้ดูแลตรวจสอบ",
};

export interface SlipVerifier {
  id: "slipok";
  verify(file: Blob, filename: string, expectedAmountMinor: number): Promise<SlipResult>;
}

interface SlipOkParty {
  displayName?: string;
  name?: string;
  proxy?: { value?: string } | null;
  account?: { value?: string } | null;
}

interface SlipOkData {
  success?: boolean;
  transRef?: string;
  transTimestamp?: string;
  transDate?: string;
  transTime?: string;
  amount?: number;
  receiver?: SlipOkParty;
}

/** SlipOK reports dates as Bangkok local time when no timestamp is present. */
function slipOkTime(d: SlipOkData): string | null {
  if (d.transTimestamp && !Number.isNaN(Date.parse(d.transTimestamp))) {
    return new Date(d.transTimestamp).toISOString();
  }
  if (d.transDate && /^\d{8}$/.test(d.transDate) && d.transTime && /^\d{2}:\d{2}:\d{2}$/.test(d.transTime)) {
    const iso = `${d.transDate.slice(0, 4)}-${d.transDate.slice(4, 6)}-${d.transDate.slice(6)}T${d.transTime}+07:00`;
    return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
  }
  return null;
}

export function mapSlipOkData(d: SlipOkData | null | undefined): SlipResult | null {
  const transferredAt = d ? slipOkTime(d) : null;
  if (!d?.transRef || typeof d.amount !== "number" || !transferredAt) return null;
  const r = d.receiver ?? {};
  return {
    transRef: d.transRef,
    amountMinor: Math.round(d.amount * 100),
    transferredAt,
    receiverText: [r.displayName, r.name, r.proxy?.value, r.account?.value].filter(Boolean).join(" | "),
  };
}

/**
 * Error codes documented by SlipOK (API v1.8). 1000–1004 are our own setup
 * (missing data, branch, key, package), 1005–1008 and 1011 mean the image is
 * not a usable slip, 1009–1010 mean the bank has not reported the transfer yet.
 */
export function slipOkFailure(code: number | undefined): SlipFailure {
  if (code === 1013) return "amount_mismatch";
  if (code === 1014) return "wrong_receiver";
  if (code === 1009 || code === 1010) return "bank_delay";
  if (code !== undefined && ((code >= 1005 && code <= 1008) || code === 1011)) return "unreadable";
  return "unavailable";
}

function createSlipOkVerifier(branchId: string, apiKey: string): SlipVerifier {
  return {
    id: "slipok",
    async verify(file, filename, expectedAmountMinor) {
      const form = new FormData();
      form.append("files", file, filename);
      // log=true makes the service check the recipient against the account registered with it
      form.append("log", "true");
      form.append("amount", String(expectedAmountMinor / 100));

      let res: Response;
      try {
        res = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`, {
          method: "POST",
          headers: { "x-authorization": apiKey },
          body: form,
        });
      } catch (err) {
        throw new SlipError("unavailable", `slip service unreachable: ${(err as Error).message}`);
      }
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; code?: number; message?: string; data?: SlipOkData & { code?: number } }
        | null;
      if (!json) throw new SlipError("unavailable", `slip service returned HTTP ${res.status} without JSON`);

      const result = mapSlipOkData(json.data);
      if (res.ok && json.success && json.data?.success !== false && result) return result;

      const code = json.code ?? json.data?.code;
      // "repeated slip" still carries the slip data; our own one-transfer-one-payment
      // rule decides, so a retry after a failure on our side is not locked out
      if (code === 1012 && result) return result;
      if (code === 1012) throw new SlipError("slip_used", "slip already recorded by the service");
      throw new SlipError(slipOkFailure(code), `slipok ${code ?? res.status}: ${json.message ?? "rejected"}`);
    },
  };
}

/** null when no slip-verification service is configured — transfers are then approved by an admin. */
export function slipVerifier(): SlipVerifier | null {
  const branch = process.env.SLIPOK_BRANCH_ID?.trim();
  const key = process.env.SLIPOK_API_KEY?.trim();
  return branch && key ? createSlipOkVerifier(branch, key) : null;
}

const fold = (s: string) => s.toLowerCase().replace(/[\s\-.]/g, "");

/**
 * Our own checks on a slip the service has confirmed. Returns the reason it
 * cannot pay for this payment, or null when it can.
 */
export function checkSlip(
  slip: SlipResult,
  expected: { amountMinor: number; createdAt: string; receiverHint?: string },
): SlipFailure | null {
  if (slip.amountMinor !== expected.amountMinor) return "amount_mismatch";
  // the transfer must belong to this payment, not to an older one
  if (Date.parse(slip.transferredAt) < Date.parse(expected.createdAt) - 10 * 60_000) return "slip_too_old";
  const hint = expected.receiverHint?.trim();
  if (hint && !fold(slip.receiverText).includes(fold(hint))) return "wrong_receiver";
  return null;
}
