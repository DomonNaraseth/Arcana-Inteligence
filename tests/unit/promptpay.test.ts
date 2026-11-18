import { describe, expect, it } from "vitest";
import {
  maskPromptPayId,
  normalizePromptPayId,
  promptPayConfig,
  promptPayPayload,
} from "@/lib/billing/promptpay";
import { planLabel } from "@/lib/billing/service";
import { checkSlip, mapSlipOkData, slipOkBody, slipOkFailure, type SlipResult } from "@/lib/billing/slip";
import { DEFAULT_SETTINGS, settingsSchemas } from "@/lib/settings";

describe("PromptPay QR", () => {
  it("accepts a mobile number, a national id or an e-wallet id and nothing else", () => {
    expect(normalizePromptPayId("081-234-5678")).toBe("0812345678");
    expect(normalizePromptPayId("1 2345 67890 12 3")).toBe("1234567890123");
    expect(normalizePromptPayId("123456789012345")).toBe("123456789012345");
    expect(normalizePromptPayId("812345678")).toBeNull();
    expect(normalizePromptPayId("1234567890")).toBeNull(); // 10 digits must be a mobile number
    expect(normalizePromptPayId("")).toBeNull();
    expect(normalizePromptPayId(undefined)).toBeNull();
  });

  it("builds the standard payload with the exact amount in baht", () => {
    // reference values produced by the promptpay-qr library for these inputs
    expect(promptPayPayload("0801234567", 9900)).toBe(
      "00020101021229370016A000000677010111011300668012345675802TH5303764540599.0063044149",
    );
    expect(promptPayPayload("1234567890123", 14900)).toBe(
      "00020101021229370016A000000677010111021312345678901235802TH53037645406149.0063047E8A",
    );
  });

  it("keeps satang and refuses nonsense", () => {
    expect(promptPayPayload("0801234567", 9950)).toContain("540599.50");
    expect(() => promptPayPayload("0801234567", 0)).toThrow();
    expect(() => promptPayPayload("0801234567", 99.5)).toThrow();
    expect(() => promptPayPayload("12345", 9900)).toThrow();
  });

  it("shows only part of the PromptPay id to the payer", () => {
    expect(maskPromptPayId("0812345678")).toBe("081-xxx-5678");
    expect(maskPromptPayId("1234567890123")).not.toContain("23456789");
  });

  it("is off until an admin switches it on with a valid id", () => {
    expect(promptPayConfig(DEFAULT_SETTINGS)).toBeNull();
    const on = { ...DEFAULT_SETTINGS, promptpay: { enabled: true, id: "0812345678", account_name: " ร้าน ก ", receiver_hint: "" } };
    expect(promptPayConfig(on)).toEqual({ id: "0812345678", accountName: "ร้าน ก", receiverHint: "" });
    expect(promptPayConfig({ ...on, promptpay: { ...on.promptpay, id: "12345" } })).toBeNull();
    expect(promptPayConfig({ ...on, promptpay: { ...on.promptpay, enabled: false } })).toBeNull();
  });

  it("lets an admin save a real PromptPay id and refuses anything that is not digits", () => {
    const base = { enabled: true, account_name: "ร้าน ก", receiver_hint: "" };
    expect(settingsSchemas.promptpay.safeParse({ ...base, id: "0812345678" }).success).toBe(true);
    expect(settingsSchemas.promptpay.safeParse({ ...base, id: "1234567890123" }).success).toBe(true);
    expect(settingsSchemas.promptpay.safeParse({ ...base, id: "" }).success).toBe(true);
    expect(settingsSchemas.promptpay.safeParse({ ...base, id: "081-234-5678" }).success).toBe(false);
    expect(settingsSchemas.promptpay.safeParse({ ...base, id: "dddd" }).success).toBe(false);
  });

  it("labels a prepaid membership differently from a recurring one", () => {
    expect(planLabel("Plus", "prepaid")).toBe("Plus (30 วัน)");
    expect(planLabel("Plus")).toBe("Plus (รายเดือน)");
  });
});

describe("slip verification", () => {
  it("sends SlipOK the image as plain base64 with a real boolean log and a baht amount", () => {
    const body = slipOkBody(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 9900);
    expect(body).toEqual({ files: "iVBORw==", log: true, amount: 99 });
    expect(JSON.parse(JSON.stringify(body)).log).toBe(true);
  });

  // field names and example values from the SlipOK check-slip documentation
  const data = {
    success: true,
    transRef: "010092101507665143",
    transDate: "20200401",
    transTime: "10:15:07",
    transTimestamp: "2020-04-01T03:15:07.000Z",
    amount: 50,
    receiver: {
      displayName: "ธนาทร ร",
      name: "THANATORN R",
      proxy: { type: "MSISDN", value: "086xxx0000" },
      account: { type: "BANKAC", value: "xxx-x-x3109-x" },
    },
  };

  it("maps a confirmed slip", () => {
    const slip = mapSlipOkData(data);
    expect(slip).toMatchObject({
      transRef: "010092101507665143",
      amountMinor: 5000,
      transferredAt: "2020-04-01T03:15:07.000Z",
    });
    expect(slip?.receiverText).toContain("THANATORN R");
    expect(slip?.receiverText).toContain("xxx-x-x3109-x");
  });

  it("falls back to the Bangkok date and time, and rejects incomplete data", () => {
    const { transTimestamp: _omit, ...withoutTimestamp } = data;
    expect(mapSlipOkData(withoutTimestamp)?.transferredAt).toBe("2020-04-01T03:15:07.000Z");
    expect(mapSlipOkData({ ...data, transRef: undefined })).toBeNull();
    expect(mapSlipOkData({ ...data, amount: undefined })).toBeNull();
    expect(mapSlipOkData({ transRef: "x", amount: 1 })).toBeNull();
    expect(mapSlipOkData(null)).toBeNull();
  });

  it("turns the service's error codes into the right customer message", () => {
    expect(slipOkFailure(1013)).toBe("amount_mismatch");
    expect(slipOkFailure(1014)).toBe("wrong_receiver");
    expect(slipOkFailure(1010)).toBe("bank_delay");
    expect(slipOkFailure(1007)).toBe("unreadable");
    expect(slipOkFailure(1011)).toBe("unreadable");
    // our own setup problems are never blamed on the customer's slip
    expect(slipOkFailure(1002)).toBe("unavailable");
    expect(slipOkFailure(1004)).toBe("unavailable");
    expect(slipOkFailure(undefined)).toBe("unavailable");
  });

  const slip: SlipResult = {
    transRef: "010092101507665143",
    amountMinor: 9900,
    transferredAt: "2026-11-18T05:00:00.000Z",
    receiverText: "ธนาทร ร | THANATORN R | 086xxx0000 | xxx-x-x3109-x",
  };
  const expected = { amountMinor: 9900, createdAt: "2026-11-18T04:58:00.000Z" };

  it("accepts a slip that fits the payment", () => {
    expect(checkSlip(slip, expected)).toBeNull();
    // the customer may transfer first and open the payment a few minutes later
    expect(checkSlip({ ...slip, transferredAt: "2026-11-18T04:50:00.000Z" }, expected)).toBeNull();
  });

  it("rejects another amount or an older transfer", () => {
    expect(checkSlip({ ...slip, amountMinor: 9800 }, expected)).toBe("amount_mismatch");
    expect(checkSlip({ ...slip, amountMinor: 19900 }, expected)).toBe("amount_mismatch");
    expect(checkSlip({ ...slip, transferredAt: "2026-11-17T05:00:00.000Z" }, expected)).toBe("slip_too_old");
  });

  it("checks the recipient hint against names and masked numbers", () => {
    expect(checkSlip(slip, { ...expected, receiverHint: "thanatorn" })).toBeNull();
    expect(checkSlip(slip, { ...expected, receiverHint: "3109" })).toBeNull();
    expect(checkSlip(slip, { ...expected, receiverHint: "ธนาทร" })).toBeNull();
    expect(checkSlip(slip, { ...expected, receiverHint: "somchai" })).toBe("wrong_receiver");
    expect(checkSlip(slip, { ...expected, receiverHint: "  " })).toBeNull();
  });
});
