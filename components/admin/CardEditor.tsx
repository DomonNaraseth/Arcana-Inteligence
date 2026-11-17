"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";

export interface CardFields {
  nameTh: string;
  keywords: string[];
  keywordsReversed: string[];
  uprightTh: string;
  reversedTh: string;
  loveTh: string;
  careerTh: string;
  financeTh: string;
  adviceTh: string;
}

type TextKey = "nameTh" | "uprightTh" | "reversedTh" | "loveTh" | "careerTh" | "financeTh" | "adviceTh";
type ListKey = "keywords" | "keywordsReversed";

const TEXT_FIELDS: { key: TextKey; label: string; hint: string; rows: number; max: number }[] = [
  { key: "uprightTh", label: "ความหมายตั้งตรง (Upright)", hint: "ความหมายตามขนบเมื่อไพ่ตั้งตรง", rows: 3, max: 700 },
  { key: "reversedTh", label: "ความหมายกลับหัว (Reversed)", hint: "พลังที่ติดขัด ล่าช้า หรือหันเข้าด้านใน — ไม่จำเป็นต้องร้าย", rows: 3, max: 700 },
  { key: "loveTh", label: "ด้านความรัก", hint: "", rows: 2, max: 500 },
  { key: "careerTh", label: "ด้านการงาน", hint: "", rows: 2, max: 500 },
  { key: "financeTh", label: "ด้านการเงิน", hint: "", rows: 2, max: 500 },
  { key: "adviceTh", label: "คำแนะนำจากไพ่", hint: "", rows: 2, max: 400 },
];

const toList = (text: string) =>
  text
    .split(/[,\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function CardEditor({
  id,
  current,
  defaults,
}: {
  id: string;
  current: CardFields;
  defaults: CardFields;
}) {
  const router = useRouter();
  const [text, setText] = useState<Record<TextKey, string>>({
    nameTh: current.nameTh,
    uprightTh: current.uprightTh,
    reversedTh: current.reversedTh,
    loveTh: current.loveTh,
    careerTh: current.careerTh,
    financeTh: current.financeTh,
    adviceTh: current.adviceTh,
  });
  const [lists, setLists] = useState<Record<ListKey, string>>({
    keywords: current.keywords.join(", "),
    keywordsReversed: current.keywordsReversed.join(", "),
  });
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const changedFromDefault = (key: TextKey) => text[key].trim() !== defaults[key];
  const listChanged = (key: ListKey) => !sameList(toList(lists[key]), defaults[key]);
  const anyOverride =
    (Object.keys(text) as TextKey[]).some(changedFromDefault) ||
    (Object.keys(lists) as ListKey[]).some(listChanged);

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
          ? `บันทึกแล้ว — แก้ทับค่าเริ่มต้น ${data.fields.length} ช่อง มีผลกับผู้ใช้และ AI ภายในราว 30 วินาที`
          : "ไพ่ใบนี้ใช้ค่าเริ่มต้นทั้งหมดแล้ว",
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function save() {
    void send(
      {
        type: "card",
        id,
        fields: {
          ...Object.fromEntries((Object.keys(text) as TextKey[]).map((k) => [k, text[k].trim()])),
          keywords: toList(lists.keywords),
          keywordsReversed: toList(lists.keywordsReversed),
        },
      },
      "save",
    );
  }

  function resetAll() {
    if (!window.confirm("คืนค่าเริ่มต้นของไพ่ใบนี้ทุกช่อง? การแก้ไขที่บันทึกไว้จะถูกลบ (ยังดูย้อนหลังได้ใน audit log)")) return;
    setText({
      nameTh: defaults.nameTh,
      uprightTh: defaults.uprightTh,
      reversedTh: defaults.reversedTh,
      loveTh: defaults.loveTh,
      careerTh: defaults.careerTh,
      financeTh: defaults.financeTh,
      adviceTh: defaults.adviceTh,
    });
    setLists({
      keywords: defaults.keywords.join(", "),
      keywordsReversed: defaults.keywordsReversed.join(", "),
    });
    void send({ type: "card", id, reset: true }, "reset");
  }

  const fieldHeader = (label: string, changed: boolean, onRestore: () => void) => (
    <span className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium text-ivory">{label}</span>
      {changed && (
        <span className="flex items-center gap-3 text-xs">
          <span className="text-gold">ต่างจากค่าเริ่มต้น</span>
          <button type="button" onClick={onRestore} className="text-ivory-dim underline-offset-4 hover:text-ivory hover:underline">
            ใช้ค่าเริ่มต้น
          </button>
        </span>
      )}
    </span>
  );

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="panel space-y-6 p-6">
        <label className="block">
          {fieldHeader("ชื่อไพ่ภาษาไทย", changedFromDefault("nameTh"), () => setText({ ...text, nameTh: defaults.nameTh }))}
          <input
            value={text.nameTh}
            onChange={(e) => setText({ ...text, nameTh: e.target.value.slice(0, 60) })}
            className="field mt-2"
          />
        </label>

        {(
          [
            { key: "keywords", label: "คำสำคัญ — ตั้งตรง" },
            { key: "keywordsReversed", label: "คำสำคัญ — กลับหัว" },
          ] as { key: ListKey; label: string }[]
        ).map((f) => (
          <label key={f.key} className="block">
            {fieldHeader(f.label, listChanged(f.key), () => setLists({ ...lists, [f.key]: defaults[f.key].join(", ") }))}
            <input
              value={lists[f.key]}
              onChange={(e) => setLists({ ...lists, [f.key]: e.target.value })}
              className="field mt-2 text-sm"
            />
            <span className="mt-1 block text-xs text-ivory-dim">
              คั่นด้วยจุลภาค 3–8 คำ — ส่งให้ AI เป็นหลักยึดของความหมาย ({toList(lists[f.key]).length} คำ)
            </span>
          </label>
        ))}
      </div>

      <div className="panel space-y-6 p-6">
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className="block">
            {fieldHeader(f.label, changedFromDefault(f.key), () => setText({ ...text, [f.key]: defaults[f.key] }))}
            <textarea
              value={text[f.key]}
              onChange={(e) => setText({ ...text, [f.key]: e.target.value.slice(0, f.max) })}
              rows={f.rows}
              className="field mt-2 resize-y text-[15px] leading-relaxed"
            />
            <span className="mt-1 flex justify-between gap-3 text-xs text-ivory-dim">
              <span>{f.hint}</span>
              <span className="shrink-0 tabular-nums">
                {text[f.key].length}/{f.max}
              </span>
            </span>
            {changedFromDefault(f.key) && (
              <details className="mt-1 text-xs text-ivory-dim">
                <summary className="cursor-pointer hover:text-ivory">ดูค่าเริ่มต้น</summary>
                <p className="mt-1 rounded-lg border border-white/10 bg-midnight/40 p-3 leading-relaxed">{defaults[f.key]}</p>
              </details>
            )}
          </label>
        ))}
      </div>

      <p className="text-xs text-ivory-dim">
        ความหมายควรอยู่ในกรอบการตีความ Rider-Waite-Smith ตามขนบ — ข้อความเหล่านี้คือ “ข้อเท็จจริงของไพ่”
        ที่ AI ใช้เป็นฐาน จึงไม่ควรใส่คำทำนายที่ฟันธงหรือสร้างความกลัว
      </p>

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
        <button type="button" onClick={resetAll} disabled={busy !== null || !anyOverride} className="btn-ghost">
          {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          คืนค่าเริ่มต้นทั้งใบ
        </button>
      </div>
    </form>
  );
}
