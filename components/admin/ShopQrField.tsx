"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { checkThaiQr, thaiQrWithAmount } from "@/lib/billing/thaiqr";

/** Reads the QR in an image file, in the browser — the image is never uploaded. */
async function readQrImage(file: File): Promise<string | null> {
  const [{ default: jsQR }, bitmap] = await Promise.all([import("jsqr"), createImageBitmap(file)]);
  // a phone screenshot is large; the QR stays readable at this size and the scan stays quick
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

/**
 * The shop's own QR (K SHOP, แม่มณี or another bank's merchant QR). With it the
 * payer's banking app shows the shop's name instead of a personal account
 * name. A ฿1 test QR lets the owner see that name before customers do.
 */
export function ShopQrField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [testQr, setTestQr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const check = value.trim() ? checkThaiQr(value) : null;

  useEffect(() => {
    let live = true;
    setTestQr(null);
    if (!check?.ok) return;
    import("qrcode")
      .then((QR) => QR.toDataURL(thaiQrWithAmount(value, 100), { errorCorrectionLevel: "M", margin: 2, width: 320 }))
      .then((url) => live && setTestQr(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // the test QR depends only on the QR text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const text = await readQrImage(file);
      if (text) onChange(text.trim());
      else setReadError("หา QR ในภาพนี้ไม่เจอ — ใช้ภาพที่เห็น QR ทั้งอันชัด ๆ (บันทึกภาพ QR จากแอปร้านค้า หรือแคปหน้าจอ)");
    } catch {
      setReadError("เปิดภาพนี้ไม่ได้ — ลองใช้ไฟล์ JPG หรือ PNG");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-midnight/40 p-4">
      <h3 className="text-sm font-medium text-gold">QR ร้านค้า (ลูกค้าเห็นชื่อร้านแทนชื่อบัญชีส่วนตัว)</h3>
      <p className="mt-1 text-xs text-ivory-dim">
        สมัครรับเงินแบบร้านค้าฟรีได้ที่แอป K SHOP (กสิกรไทย) หรือแม่มณี (ไทยพาณิชย์) แล้วบันทึกภาพ QR ประจำร้าน (แบบไม่ระบุยอด) มาอัปโหลดที่นี่
        ระบบจะใส่ยอดให้ทุกรายการเอง เมื่อใส่ QR ร้านแล้ว หมายเลข PromptPay ด้านบนจะไม่ถูกใช้
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id="shop-qr-file"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <label htmlFor="shop-qr-file" className="btn-ghost cursor-pointer px-4 py-2 text-sm">
          <ImageUp className="h-4 w-4" aria-hidden="true" />
          {reading ? "กำลังอ่าน QR…" : "อัปโหลดภาพ QR ร้าน"}
        </label>
        {value && (
          <button type="button" className="btn-quiet px-3 py-2 text-sm" onClick={() => onChange("")}>
            <X className="h-4 w-4" aria-hidden="true" />
            เอา QR ร้านออก (กลับไปใช้หมายเลข PromptPay)
          </button>
        )}
      </div>
      {readError && <p className="mt-2 text-xs text-amber-200">{readError}</p>}

      <details className="mt-3" open={Boolean(value) && !check?.ok}>
        <summary className="cursor-pointer text-xs text-ivory-dim">หรือวางข้อความของ QR</summary>
        <textarea
          value={value}
          // trimmed when checked and saved, not per keystroke — a merchant name may hold spaces
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ""))}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          className="field mt-2 py-2 font-mono text-xs"
          placeholder="000201010211…"
        />
      </details>

      {check && !check.ok && <p className="mt-2 text-sm text-amber-200">{check.reason}</p>}
      {check?.ok && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          {testQr ? (
            <div className="mx-auto w-40 overflow-hidden rounded-lg bg-white p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={testQr} alt="QR ทดสอบยอด 1 บาท" width={320} height={320} className="h-auto w-full" />
            </div>
          ) : (
            <div className="mx-auto h-40 w-40 animate-pulse rounded-lg bg-white/10" aria-hidden="true" />
          )}
          <div className="text-sm">
            <p className="text-ivory">
              {check.info.kind === "bill" ? "QR ร้านค้า" : "QR พร้อมเพย์"} · รหัสผู้รับ{" "}
              <span className="font-mono">{check.info.maskedId}</span>
              {check.info.merchantName && <> · ชื่อใน QR: {check.info.merchantName}</>}
            </p>
            {check.info.kind === "transfer" && (
              <p className="mt-2 text-amber-200">
                QR นี้เป็นพร้อมเพย์บุคคล แอปธนาคารของลูกค้าจะยังแสดงชื่อบัญชีส่วนตัว — ใช้ QR จากแอปร้านค้าแทนถ้าต้องการให้เห็นชื่อร้าน
              </p>
            )}
            <p className="mt-2 text-ivory-dim">
              ทดสอบก่อนบันทึก: สแกน QR ด้านซ้าย (ยอด ฿1.00) ด้วยแอปธนาคาร ดูชื่อผู้รับที่ขึ้นในหน้ายืนยัน — นั่นคือชื่อที่ลูกค้าจะเห็น
              แล้วกดยกเลิกได้เลย ไม่ต้องโอน
            </p>
            <p className="mt-2 text-xs text-ivory-dim">
              หลังเปลี่ยนมาใช้ QR ร้าน ให้ตั้ง “ชื่อบัญชีผู้รับ” เป็นชื่อร้านที่ขึ้นในแอปธนาคาร และลองซื้อจริงหนึ่งครั้งเพื่อดูว่าการตรวจสลิปอัตโนมัติผ่าน
              (ถ้าไม่ผ่าน ลูกค้ายังกด “แจ้งโอนแล้ว” ให้คุณตรวจเองได้ตามเดิม)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
