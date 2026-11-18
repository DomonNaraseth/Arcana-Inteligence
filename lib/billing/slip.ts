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
  /** our own SlipOK setup is refused (branch id, key, package, quota) — not the customer's fault */
  | "setup"
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
  setup:
    "ระบบตรวจสลิปอัตโนมัติยังไม่พร้อมใช้งาน — สลิปของคุณไม่มีปัญหา กรุณากด “แจ้งโอนแล้ว” ด้านล่าง ผู้ดูแลจะตรวจยอดและเพิ่มเครดิตให้",
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
  if (code !== undefined && ((code >= 1000 && code <= 1004) || code === 1015)) return "setup";
  if (code !== undefined && ((code >= 1005 && code <= 1008) || code === 1011)) return "unreadable";
  return "unavailable";
}

/**
 * The request body SlipOK documents for an image sent as JSON: the image as
 * plain base64 in `files`, `log` and `amount` as real boolean and number.
 * (A multipart upload is silently dropped when the part's filename has no
 * image extension, and the service then answers 1000 "no QR data".)
 */
export function slipOkBody(image: Uint8Array, expectedAmountMinor: number) {
  return {
    files: Buffer.from(image).toString("base64"),
    // makes the service check the recipient against the account registered with it
    log: true,
    amount: expectedAmountMinor / 100,
  };
}

function createSlipOkVerifier(branchId: string, apiKey: string): SlipVerifier {
  return {
    id: "slipok",
    async verify(file, _filename, expectedAmountMinor) {
      const body = slipOkBody(new Uint8Array(await file.arrayBuffer()), expectedAmountMinor);

      let res: Response;
      try {
        res = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`, {
          method: "POST",
          headers: { "x-authorization": apiKey, "content-type": "application/json" },
          body: JSON.stringify(body),
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

export interface SlipOkHealth {
  configured: boolean;
  /** the quota call answered: the branch id and API key are accepted */
  connected: boolean;
  quota?: number;
  endDate?: string | null;
  /** SlipOK's own code and message when something is refused (never the key) */
  code?: number;
  message?: string;
  /** what the service answers to a QR text that is not a slip — 1008 means requests reach it intact */
  probe?: { code?: number; message?: string };
  /** the shape of the two settings, never their values — helps spot a swapped or mistyped one */
  shape?: {
    branchDigitsOnly: boolean;
    branchLength: number;
    branchDigits: number;
    branchLetters: number;
    branchOther: number;
    keyLength: number;
    keyLooksLikeBranch: boolean;
  };
  /**
   * Differential probes of the quota call, to tell a malformed branch id from a
   * wrong key: with a dummy numeric branch, and with only the digits of ours.
   */
  probes?: { dummyNumericBranch?: number | "ok"; digitsOfBranch?: number | "ok" | "n/a" };
}

function shapeOf(branch: string, key: string): NonNullable<SlipOkHealth["shape"]> {
  return {
    branchDigitsOnly: /^\d+$/.test(branch),
    branchLength: branch.length,
    branchDigits: (branch.match(/\d/g) ?? []).length,
    branchLetters: (branch.match(/[A-Za-z]/g) ?? []).length,
    branchOther: (branch.match(/[^A-Za-z\d]/g) ?? []).length,
    keyLength: key.length,
    keyLooksLikeBranch: /^\d+$/.test(key),
  };
}

/**
 * Asks SlipOK for the branch's remaining quota (free: no slip is checked) and
 * sends one QR text that is not a slip. Used by Admin → Payments to show
 * whether automatic slip checking really works, without exposing the key.
 */
export async function slipOkHealth(): Promise<SlipOkHealth> {
  const branch = process.env.SLIPOK_BRANCH_ID?.trim();
  const key = process.env.SLIPOK_API_KEY?.trim();
  if (!branch || !key) return { configured: false, connected: false };
  const base = `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branch)}`;
  const read = async (res: Response) =>
    (await res.json().catch(() => null)) as
      | { success?: boolean; code?: number; message?: string; data?: { quota?: number; endDate?: string | null } }
      | null;
  try {
    const q = await read(await fetch(`${base}/quota`, { headers: { "x-authorization": key }, cache: "no-store" }));
    const health: SlipOkHealth = {
      configured: true,
      connected: Boolean(q?.success),
      quota: q?.data?.quota,
      endDate: q?.data?.endDate ?? null,
      code: q?.code,
      message: q?.message,
      shape: shapeOf(branch, key),
    };
    const p = await read(
      await fetch(base, {
        method: "POST",
        headers: { "x-authorization": key, "content-type": "application/json" },
        body: JSON.stringify({ data: "ARCANA-HEALTH-CHECK" }),
        cache: "no-store",
      }),
    );
    health.probe = { code: p?.code, message: p?.message };

    if (!health.connected) {
      const quotaCode = async (b: string) => {
        const r = await read(
          await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(b)}/quota`, {
            headers: { "x-authorization": key },
            cache: "no-store",
          }),
        );
        return r?.success ? ("ok" as const) : (r?.code ?? -1);
      };
      const digits = branch.replace(/\D/g, "");
      health.probes = {
        dummyNumericBranch: await quotaCode("1"),
        digitsOfBranch: digits && digits !== branch ? await quotaCode(digits) : "n/a",
      };
    }
    return health;
  } catch (err) {
    return { configured: true, connected: false, message: (err as Error).message, shape: shapeOf(branch, key) };
  }
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
