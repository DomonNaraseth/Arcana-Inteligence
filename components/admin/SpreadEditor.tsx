"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";

export interface SpreadFields {
  nameTh: string;
  descriptionTh: string;
  interpretationStrategyTh: string;
  positions: { nameTh: string; meaningTh: string }[];
}

const equal = (a: SpreadFields, b: SpreadFields) => JSON.stringify(a) === JSON.stringify(b);

export function SpreadEditor({
  id,
  current,
  defaults,
  positionKeys,
}: {
  id: string;
  current: SpreadFields;
  defaults: SpreadFields;
  /** English position names, shown as a fixed reference */
  positionKeys: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<SpreadFields>(current);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmed: SpreadFields = {
    nameTh: form.nameTh.trim(),
    descriptionTh: form.descriptionTh.trim(),
    interpretationStrategyTh: form.interpretationStrategyTh.trim(),
    positions: form.positions.map((p) => ({ nameTh: p.nameTh.trim(), meaningTh: p.meaningTh.trim() })),
  };

  async function send(body: unknown, kind: "save" | "reset") {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ");
      setNotice(
        data.overridden
          ? "บันทึกแล้ว — มีผลกับผู้ใช้และ AI ภายในราว 30 วินาที"
          : "รูปแบบนี้ใช้ค่าเริ่มต้นทั้งหมดแล้ว",
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function resetAll() {
    if (!window.confirm("คืนค่าเริ่มต้นของรูปแบบนี้ทุกช่อง? การแก้ไขที่บันทึกไว้จะถูกลบ (ยังดูย้อนหลังได้ใน audit log)")) return;
    setForm(defaults);
    void send({ type: "spread", id, reset: true }, "reset");
  }

  const differs = (a: string, b: string) => a.trim() !== b;
  const tag = (changed: boolean, onRestore: () => void) =>
    changed && (
      <span className="flex items-center gap-3 text-xs">
        <span className="text-gold">ต่างจากค่าเริ่มต้น</span>
        <button type="button" onClick={onRestore} className="text-ivory-dim underline-offset-4 hover:text-ivory hover:underline">
          ใช้ค่าเริ่มต้น
        </button>
      </span>
    );

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void send({ type: "spread", id, fields: trimmed }, "save");
      }}
    >
      <div className="panel space-y-6 p-6">
        <label className="block">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-ivory">ชื่อรูปแบบ (ภาษาไทย)</span>
            {tag(differs(form.nameTh, defaults.nameTh), () => setForm({ ...form, nameTh: defaults.nameTh }))}
          </span>
          <input
            value={form.nameTh}
            onChange={(e) => setForm({ ...form, nameTh: e.target.value.slice(0, 60) })}
            className="field mt-2"
          />
        </label>

        <label className="block">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-ivory">คำอธิบายสำหรับผู้ใช้</span>
            {tag(differs(form.descriptionTh, defaults.descriptionTh), () =>
              setForm({ ...form, descriptionTh: defaults.descriptionTh }),
            )}
          </span>
          <textarea
            value={form.descriptionTh}
            onChange={(e) => setForm({ ...form, descriptionTh: e.target.value.slice(0, 400) })}
            rows={2}
            className="field mt-2 resize-y text-[15px]"
          />
          <span className="mt-1 block text-xs text-ivory-dim">
            แสดงตอนเลือกรูปแบบ และ AI ใช้ตัดสินใจว่าคำถามแบบไหนเหมาะกับรูปแบบนี้ ({form.descriptionTh.length}/400)
          </span>
        </label>

        <label className="block">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-ivory">แนวทางการตีความ (สำหรับ AI)</span>
            {tag(differs(form.interpretationStrategyTh, defaults.interpretationStrategyTh), () =>
              setForm({ ...form, interpretationStrategyTh: defaults.interpretationStrategyTh }),
            )}
          </span>
          <textarea
            value={form.interpretationStrategyTh}
            onChange={(e) => setForm({ ...form, interpretationStrategyTh: e.target.value.slice(0, 600) })}
            rows={3}
            className="field mt-2 resize-y text-[15px]"
          />
          <span className="mt-1 block text-xs text-ivory-dim">
            บอก AI ว่าควรเล่าไพ่ชุดนี้อย่างไร — ไม่แสดงให้ผู้ใช้เห็น ({form.interpretationStrategyTh.length}/600)
          </span>
        </label>
      </div>

      <fieldset className="panel p-6">
        <legend className="sr-only">ตำแหน่งไพ่</legend>
        <h2 className="text-xl font-semibold">ตำแหน่งไพ่ {form.positions.length} ตำแหน่ง</h2>
        <p className="mt-1 text-sm text-ivory-dim">
          ชื่อตำแหน่งแสดงใต้ไพ่ ความหมายของตำแหน่งคือสิ่งที่ AI ใช้ตีความไพ่ที่ตกในตำแหน่งนั้น
        </p>
        <ol className="mt-5 space-y-4">
          {form.positions.map((p, i) => {
            const d = defaults.positions[i];
            const changed = differs(p.nameTh, d.nameTh) || differs(p.meaningTh, d.meaningTh);
            return (
              <li key={i} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/50 text-xs text-gold">
                      {i + 1}
                    </span>
                    <span className="text-ivory-dim">{positionKeys[i]}</span>
                  </span>
                  {tag(changed, () =>
                    setForm({ ...form, positions: form.positions.map((x, j) => (j === i ? { ...d } : x)) }),
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[14rem_1fr]">
                  <label className="block">
                    <span className="sr-only">ชื่อตำแหน่งที่ {i + 1}</span>
                    <input
                      value={p.nameTh}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          positions: form.positions.map((x, j) =>
                            j === i ? { ...x, nameTh: e.target.value.slice(0, 60) } : x,
                          ),
                        })
                      }
                      placeholder="ชื่อตำแหน่ง"
                      className="field py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="sr-only">ความหมายของตำแหน่งที่ {i + 1}</span>
                    <input
                      value={p.meaningTh}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          positions: form.positions.map((x, j) =>
                            j === i ? { ...x, meaningTh: e.target.value.slice(0, 200) } : x,
                          ),
                        })
                      }
                      placeholder="ความหมายของตำแหน่ง"
                      className="field py-2 text-sm"
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-light">
          <Check className="h-4 w-4 shrink-0" /> {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy !== null} className="btn-gold">
          {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกการแก้ไข
        </button>
        <button type="button" onClick={resetAll} disabled={busy !== null || equal(trimmed, defaults)} className="btn-ghost">
          {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          คืนค่าเริ่มต้นทั้งหมด
        </button>
      </div>
    </form>
  );
}
