"use client";

import { useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import type { SlipOkHealth } from "@/lib/billing/slip";

/** Explains in plain words what SlipOK answered, so the owner knows what to fix. */
function verdict(h: SlipOkHealth): { ok: boolean; text: string }[] {
  if (!h.configured) return [{ ok: false, text: "ยังไม่ได้ตั้ง SLIPOK_BRANCH_ID และ SLIPOK_API_KEY บน Vercel" }];
  const lines: { ok: boolean; text: string }[] = [];
  if (h.connected) {
    lines.push({
      ok: true,
      text: `เชื่อมต่อ SlipOK ได้ — โควตาคงเหลือ ${h.quota ?? "?"} สลิป${h.endDate ? ` · แพ็กเกจหมดอายุ ${h.endDate}` : ""}`,
    });
  } else if (h.code === 1001) {
    lines.push({ ok: false, text: "SlipOK ไม่พบสาขานี้ — ตรวจ SLIPOK_BRANCH_ID ให้ตรงกับไอดีสาขาในหน้า API ของ SlipOK" });
  } else if (h.code === 1002) {
    lines.push({ ok: false, text: "API Key ไม่ถูกต้อง — คัดลอก SLIPOK_API_KEY ใหม่จากหน้า API ของ SlipOK" });
  } else if (h.code === 1003 || h.code === 1015) {
    lines.push({ ok: false, text: "ยังไม่มีแพ็กเกจหรือแพ็กเกจหมดอายุ — เลือกแพ็กเกจใน SlipOK ก่อน" });
  } else if (h.code === 1004) {
    lines.push({ ok: false, text: "ใช้โควตาเกินแล้ว — ต่อแพ็กเกจใน SlipOK" });
  } else {
    lines.push({ ok: false, text: `SlipOK ตอบกลับ: ${h.code ?? ""} ${h.message ?? "ไม่ทราบสาเหตุ"}`.trim() });
  }
  if (!h.connected && h.shape) {
    const s = h.shape;
    if (!s.branchDigitsOnly) {
      lines.push({
        ok: false,
        text: `SLIPOK_BRANCH_ID ควรเป็นตัวเลขล้วน (ไอดีสาขา) แต่ค่าที่ตั้งไว้มีตัวอักษรหรือสัญลักษณ์ปน (ยาว ${s.branchLength} ตัว) — ตรวจว่าไม่ได้วาง API Key หรือ URL ลงในช่องนี้`,
      });
    } else if (s.keyLooksLikeBranch) {
      lines.push({ ok: false, text: "SLIPOK_API_KEY เป็นตัวเลขล้วน — อาจสลับกับ SLIPOK_BRANCH_ID" });
    } else {
      lines.push({
        ok: false,
        text: `รูปแบบค่า: ไอดีสาขาเป็นตัวเลข ${s.branchLength} หลัก · API Key ยาว ${s.keyLength} ตัวอักษร — ตรวจว่าตรงกับหน้า API ของ SlipOK`,
      });
    }
  }
  if (!h.connected && h.shape && h.probes) {
    const s = h.shape;
    lines.push({
      ok: false,
      text: `ไอดีสาขาประกอบด้วย ตัวเลข ${s.branchDigits} · ตัวอักษร ${s.branchLetters} · สัญลักษณ์/ช่องว่าง ${s.branchOther} ตัว · ทดสอบสาขาตัวเลขสมมติ: ${s && h.probes.dummyNumericBranch} · ทดสอบเฉพาะตัวเลขของไอดี: ${h.probes.digitsOfBranch}`,
    });
  }
  if (h.probe?.code === 1008 || h.probe?.code === 1007 || h.probe?.code === 1011) {
    lines.push({ ok: true, text: "ทดสอบส่งข้อมูลตัวอย่าง: SlipOK อ่านคำขอได้ถูกต้อง (ตอบว่าไม่ใช่สลิป ตามที่ควร)" });
  } else if (h.probe) {
    lines.push({ ok: false, text: `ทดสอบส่งข้อมูลตัวอย่าง: SlipOK ตอบ ${h.probe.code ?? ""} ${h.probe.message ?? ""}`.trim() });
  }
  return lines;
}

/** Lets the owner confirm that automatic slip checking really reaches SlipOK. */
export function SlipOkCheck() {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<{ ok: boolean; text: string }[] | null>(null);

  async function run() {
    setBusy(true);
    setLines(null);
    try {
      const res = await fetch("/api/admin/slipok", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error?.message ?? "ตรวจการเชื่อมต่อไม่สำเร็จ");
      setLines(verdict(data as SlipOkHealth));
    } catch (e) {
      setLines([{ ok: false, text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={() => void run()} disabled={busy} className="btn-quiet border border-white/15">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
        ตรวจการเชื่อมต่อ SlipOK
      </button>
      {lines && (
        <ul className="mt-2 space-y-1 text-sm" role="status">
          {lines.map((l, i) => (
            <li key={i} className={l.ok ? "text-gold-light" : "text-red-300"}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
