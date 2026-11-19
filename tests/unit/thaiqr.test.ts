import generatePayload from "promptpay-qr";
import { describe, expect, it } from "vitest";
import { paymentPayload, promptPayConfig } from "@/lib/billing/promptpay";
import { checkThaiQr, crc16, parseTlv, thaiQrWithAmount } from "@/lib/billing/thaiqr";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings";

const f = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;
const sign = (body: string) => `${body}6304${crc16(`${body}6304`)}`;

/** a static shop QR in the bill-payment layout K SHOP and แม่มณี use (made-up ids) */
const SHOP = sign(
  f("00", "01") +
    f("01", "11") +
    f("30", f("00", "A000000677010112") + f("01", "010753600031508") + f("02", "KB000001234567")) +
    f("53", "764") +
    f("58", "TH") +
    f("59", "ARCANA SHOP") +
    f("60", "BANGKOK"),
);

describe("Thai QR checksum", () => {
  it("matches the checksum the promptpay-qr library writes", () => {
    const ref = "00020101021229370016A000000677010111011300668012345675802TH5303764540599.0063044149";
    expect(crc16(ref.slice(0, -4))).toBe("4149");
  });
});

describe("shop QR", () => {
  it("reads a shop QR and the name it carries", () => {
    expect(checkThaiQr(SHOP)).toEqual({
      ok: true,
      info: { kind: "bill", maskedId: "010xxxxxxxx1508", merchantName: "ARCANA SHOP" },
    });
  });

  it("refuses text that is not a payable Thai QR, a damaged one, or one with a fixed amount", () => {
    expect(checkThaiQr("").ok).toBe(false);
    expect(checkThaiQr("https://example.com").ok).toBe(false);
    expect(checkThaiQr(SHOP.slice(0, -1)).ok).toBe(false);
    expect(checkThaiQr(SHOP.replace("ARCANA SHOP", "ARCANA SHOQ")).ok).toBe(false); // checksum no longer fits
    const fixed = thaiQrWithAmount(SHOP, 9900);
    const r = checkThaiQr(fixed);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("ระบุยอดเงินไว้แล้ว");
    const usd = sign(f("00", "01") + f("01", "11") + f("30", f("00", "A000000677010112") + f("01", "0107536")) + f("53", "840"));
    expect(checkThaiQr(usd).ok).toBe(false);
  });

  it("adds the exact amount, keeps the shop's own fields and signs the result", () => {
    const out = thaiQrWithAmount(SHOP, 14950);
    const fields = parseTlv(out)!;
    const get = (tag: string) => fields.find((x) => x.tag === tag)?.value;
    expect(get("01")).toBe("12");
    expect(get("54")).toBe("149.50");
    expect(get("30")).toBe(parseTlv(SHOP)!.find((x) => x.tag === "30")!.value);
    expect(get("59")).toBe("ARCANA SHOP");
    expect(crc16(out.slice(0, -4))).toBe(out.slice(-4));
    expect(() => thaiQrWithAmount(SHOP, 0)).toThrow();
    expect(() => thaiQrWithAmount("nonsense", 100)).toThrow();
  });

  it("gives the same QR as the promptpay-qr library for a personal PromptPay QR", () => {
    const fixedByLibrary = generatePayload("0801234567", { amount: 99 });
    const staticByLibrary = generatePayload("0801234567", {});
    expect(checkThaiQr(staticByLibrary)).toMatchObject({ ok: true, info: { kind: "transfer" } });
    expect(thaiQrWithAmount(staticByLibrary, 9900)).toBe(fixedByLibrary);
  });
});

describe("PromptPay config with a shop QR", () => {
  const on = { ...DEFAULT_SETTINGS, promptpay: { ...DEFAULT_SETTINGS.promptpay, enabled: true, account_name: "ARCANA" } };

  it("pays the shop QR when one is set, even without a PromptPay id", () => {
    const config = promptPayConfig({ ...on, promptpay: { ...on.promptpay, merchant_qr: SHOP } });
    expect(config).toMatchObject({ id: null, merchantQr: SHOP });
    expect(paymentPayload(config!, 9900)).toBe(thaiQrWithAmount(SHOP, 9900));
  });

  it("ignores a broken shop QR and falls back to the PromptPay id", () => {
    const config = promptPayConfig({ ...on, promptpay: { ...on.promptpay, id: "0801234567", merchant_qr: "broken" } });
    expect(config).toMatchObject({ id: "0801234567", merchantQr: null });
    expect(paymentPayload(config!, 9900)).toBe(generatePayload("0801234567", { amount: 99 }));
    expect(promptPayConfig({ ...on, promptpay: { ...on.promptpay, merchant_qr: "broken" } })).toBeNull();
  });

  it("keeps a setting saved before the shop QR existed", () => {
    const old = { enabled: true, id: "0801234567", account_name: "ร้าน ก", receiver_hint: "" };
    expect(parseSettings({ promptpay: old }).promptpay).toEqual({ ...old, merchant_qr: "" });
  });
});
