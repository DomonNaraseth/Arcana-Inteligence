import { describe, expect, it } from "vitest";
import { parseCharge, parseQrCharge, qrChargeBody, verifyBeamSignature } from "@/lib/billing/beam";

// test vector published in Beam's webhook-authentication guide
const KEY = "KOFELguf5L1ltuDlkDHGUkPPnQhrgYYijTR4Fqh7APc=";
const SIGNATURE = "1XzWtJHZ9Y1tmjkA/XZUIn1ZHrUQp1d0Ms0oDQfJBto=";
const BODY =
  '{"chargeId":"ch_30GtUweMWec7r2hHIsV5xxQeJKp","merchantId":"m_2sHxsByPwESKYM4nMwdEBdhubPS","referenceId":"order#10001","status":"SUCCEEDED","currency":"THB","amount":3000000,"source":"PAYMENT_LINK","sourceId":"57Iot6c11o","transactionTime":"2025-07-23T10:16:12Z","paymentMethod":{"paymentMethodType":"CARD","card":{"last4":"1111","brand":"VISA"},"cardInstallments":null,"cardNetworkToken":null,"qrPromptPay":null,"alipay":null,"weChatPay":null,"trueMoney":null,"linePay":null,"shopeePay":null,"bangkokBankApp":null,"kPlus":null,"scbEasy":null,"krungsriApp":null},"failureCode":"","customer":{"primaryPhone":{"countryCode":"+66","number":"0958051075"},"email":"","deliveryAddress":{"contactName":"","phone":{"countryCode":"","number":""},"address":{"streetAddress":"","city":"","country":"","postCode":""}}},"createdAt":"2025-07-23T10:15:56.102401Z","updatedAt":"2025-07-23T10:16:17.418991Z"}';

describe("Beam webhook signature", () => {
  it("accepts Beam's published test vector", () => {
    expect(verifyBeamSignature(BODY, SIGNATURE, KEY)).toBe(true);
  });

  it("rejects a changed body, a wrong signature or none", () => {
    expect(verifyBeamSignature(BODY.replace("3000000", "3000001"), SIGNATURE, KEY)).toBe(false);
    expect(verifyBeamSignature(BODY, "AAAA", KEY)).toBe(false);
    expect(verifyBeamSignature(BODY, null, KEY)).toBe(false);
  });

  it("is sensitive to formatting: the raw body must be used", () => {
    expect(verifyBeamSignature(JSON.stringify(JSON.parse(BODY), null, 2), SIGNATURE, KEY)).toBe(false);
  });
});

describe("Beam charges", () => {
  it("builds a PromptPay QR charge in satang with an expiry", () => {
    const body = qrChargeBody({
      amountMinor: 9900,
      referenceId: "5f0c0b6e-0000-4000-8000-000000000000",
      returnUrl: "https://example.test/pay/x",
      expiresAt: new Date("2026-11-19T10:15:00.123Z"),
    });
    expect(body).toMatchObject({
      amount: 9900,
      currency: "THB",
      paymentMethod: { paymentMethodType: "QR_PROMPT_PAY", qrPromptPay: { expiryTime: "2026-11-19T10:15:00Z" } },
      referenceId: "5f0c0b6e-0000-4000-8000-000000000000",
    });
  });

  it("reads the QR from a create answer and refuses one without it", () => {
    expect(
      parseQrCharge({
        actionRequired: "ENCODED_IMAGE",
        chargeId: "ch_1",
        encodedImage: { expiry: "2026-11-19T10:15:00Z", imageBase64Encoded: "iVBORw0KGgo=" },
      }),
    ).toEqual({ chargeId: "ch_1", imageBase64: "iVBORw0KGgo=", expiresAt: "2026-11-19T10:15:00Z" });
    expect(parseQrCharge({ chargeId: "ch_1", actionRequired: "REDIRECT" })).toBeNull();
  });

  it("reads a charge's status, amount and currency", () => {
    expect(parseCharge(JSON.parse(BODY))).toEqual({
      chargeId: "ch_30GtUweMWec7r2hHIsV5xxQeJKp",
      referenceId: "order#10001",
      status: "SUCCEEDED",
      amount: 3000000,
      currency: "THB",
    });
    expect(parseCharge({ chargeId: "x" })).toBeNull();
  });
});
