"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  ExternalLink,
  ImagePlus,
  Loader2,
  PenLine,
  Printer,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { OracleCardBack, OracleCardFace } from "@/components/oracle/OracleCardFace";
import type { OracleCard, OracleConcept, OracleDeck } from "@/lib/oracle/schemas";

type Tab = "cards" | "concept" | "art" | "publish";
type Job = { kind: "write" | "paint"; done: number; total: number; current: string } | null;

const WRITE_BATCH = 6;

async function call<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? "ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
  return data as T;
}

function Meter({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="min-w-[9rem] flex-1">
      <div className="flex justify-between text-xs text-ivory-dim">
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ivory">{label}</span>
      {hint && <span className="ml-2 text-xs text-ivory-dim">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** The whole deck workflow on one screen: write → paint → review → print → publish. */
export function OracleStudio({ initialDeck }: { initialDeck: OracleDeck }) {
  const router = useRouter();
  const [deck, setDeck] = useState(initialDeck);
  const [tab, setTab] = useState<Tab>("cards");
  const [selected, setSelected] = useState<number | null>(null);
  const [job, setJob] = useState<Job>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const stop = useRef(false);

  const base = `/api/admin/oracle/${deck.id}`;
  const written = deck.cards.filter((c) => c.message).length;
  const painted = deck.cards.filter((c) => c.image_status === "ready").length;
  const toWrite = deck.cards.filter((c) => !c.message);
  const toPaint = deck.cards.filter((c) => c.message && c.image_status !== "ready");
  const card = deck.cards.find((c) => c.number === selected) ?? null;

  const reload = useCallback(async () => {
    const { deck: fresh } = await call<{ deck: OracleDeck }>(base);
    setDeck(fresh);
    return fresh;
  }, [base]);

  const say = (ok: boolean, text: string) => setNotice({ ok, text });

  async function writeCards(numbers: number[]) {
    await call(`${base}/cards`, { method: "POST", body: JSON.stringify({ write: numbers }) });
  }

  async function paintCard(number: number) {
    await call(`${base}/image`, { method: "POST", body: JSON.stringify({ target: "card", number }) });
  }

  async function runWriteAll() {
    if (job) return;
    stop.current = false;
    const pending = toWrite.map((c) => c.number);
    setNotice(null);
    let done = 0;
    try {
      for (let i = 0; i < pending.length && !stop.current; i += WRITE_BATCH) {
        const batch = pending.slice(i, i + WRITE_BATCH);
        setJob({ kind: "write", done, total: pending.length, current: `ไพ่หมายเลข ${batch[0]}–${batch[batch.length - 1]}` });
        await writeCards(batch);
        done += batch.length;
        await reload();
      }
      say(true, stop.current ? `หยุดแล้ว — เขียนไป ${done} ใบ` : `เขียนเนื้อหาครบ ${done} ใบแล้ว ตรวจและแก้ไขได้ที่การ์ดแต่ละใบ`);
    } catch (err) {
      say(false, `${(err as Error).message} (เขียนสำเร็จ ${done} ใบ กดอีกครั้งเพื่อทำต่อ)`);
    } finally {
      setJob(null);
    }
  }

  async function runPaintAll() {
    if (job) return;
    stop.current = false;
    const pending = toPaint;
    setNotice(null);
    let done = 0;
    let failed = 0;
    let fatal: string | null = null;
    for (const c of pending) {
      if (stop.current) break;
      setJob({ kind: "paint", done, total: pending.length, current: `${c.number}. ${c.name}` });
      try {
        await paintCard(c.number);
        done += 1;
      } catch (err) {
        failed += 1;
        // a refused or unconfigured gateway refuses every card: stop instead of burning the queue
        if (/ปฏิเสธ|Configuration Missing/.test((err as Error).message)) {
          fatal = (err as Error).message;
          break;
        }
      }
      await reload().catch(() => undefined);
    }
    setJob(null);
    if (fatal) say(false, fatal);
    else say(failed === 0, `สร้างภาพสำเร็จ ${done} ใบ${failed ? ` · ไม่สำเร็จ ${failed} ใบ (กดอีกครั้งเพื่อลองใหม่เฉพาะใบที่เหลือ)` : ""}`);
  }

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    if (busy || job) return;
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      await reload();
      if (ok) say(true, ok);
    } catch (err) {
      say(false, (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const cover = deck.cover_image;
  const allReady = written === deck.card_count && painted === deck.card_count;

  return (
    <div className="space-y-6">
      <Link href="/admin/oracle" className="inline-flex items-center gap-1.5 text-sm text-ivory-dim hover:text-ivory">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> สำรับทั้งหมด
      </Link>

      {/* deck header */}
      <header className="panel flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
        <OracleCardFace image={cover} name={deck.title} size="sm" className="w-24 shrink-0 self-center sm:self-auto" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">{deck.title}</h1>
            <span className={deck.status === "published" ? "chip" : "chip border-white/15 bg-transparent text-ivory-dim"}>
              {deck.status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
            </span>
          </div>
          <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-gold/80">{deck.title_en}</p>
          <p className="mt-2 text-sm text-ivory-dim">{deck.tagline}</p>
          <div className="mt-4 flex flex-wrap gap-5">
            <Meter label="เนื้อหาไพ่" done={written} total={deck.card_count} />
            <Meter label="ภาพไพ่" done={painted} total={deck.card_count} />
          </div>
        </div>
      </header>

      {/* running job */}
      {job && (
        <div role="status" className="panel-gold flex flex-wrap items-center gap-4 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-gold" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ivory">
              {job.kind === "write" ? "AI กำลังเขียนเนื้อหา" : "AI กำลังวาดภาพ"} — {job.current}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${Math.round((job.done / Math.max(job.total, 1)) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-ivory-dim">
              เสร็จ {job.done}/{job.total} · {job.kind === "paint" ? "ภาพละราว 20–60 วินาที" : "ชุดละราว 1 นาที"} · ปิดหน้านี้ได้ งานที่เสร็จแล้วถูกบันทึกไว้
            </p>
          </div>
          <button type="button" onClick={() => (stop.current = true)} className="btn-quiet border border-white/15">
            <Square className="h-4 w-4" aria-hidden="true" /> หยุดหลังใบนี้
          </button>
        </div>
      )}
      {notice && !job && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={clsx(
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
            notice.ok ? "border-gold/30 bg-gold/[0.07] text-ivory" : "border-red-400/30 bg-red-950/40 text-red-200",
          )}
        >
          {notice.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          {notice.text}
        </p>
      )}

      {/* tabs */}
      <div role="tablist" aria-label="ส่วนของสำรับ" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-white/10">
        {(
          [
            ["cards", `ไพ่ ${deck.card_count} ใบ`],
            ["concept", "คอนเซปและแนวภาพ"],
            ["art", "ปกและหลังไพ่"],
            ["publish", "พิมพ์และเผยแพร่"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx(
              "-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm transition-colors",
              tab === key ? "border-gold text-gold-light" : "border-transparent text-ivory-dim hover:text-ivory",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cards" && (
        <section role="tabpanel" aria-label="ไพ่" className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void runWriteAll()} disabled={!!job || !!busy || toWrite.length === 0} className="btn-gold">
              <PenLine className="h-4 w-4" aria-hidden="true" />
              {toWrite.length ? `ให้ AI เขียนเนื้อหาไพ่ที่เหลือ (${toWrite.length})` : "เขียนเนื้อหาครบแล้ว"}
            </button>
            <button type="button" onClick={() => void runPaintAll()} disabled={!!job || !!busy || toPaint.length === 0} className="btn-ghost">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {toPaint.length ? `สร้างภาพไพ่ที่เหลือ (${toPaint.length})` : painted === deck.card_count ? "สร้างภาพครบแล้ว" : "เขียนเนื้อหาก่อนจึงสร้างภาพได้"}
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5" aria-label="ไพ่ในสำรับ">
              {deck.cards.map((c) => (
                <li key={c.number}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c.number);
                      if (window.matchMedia("(max-width: 1023px)").matches) {
                        setTimeout(() => document.getElementById("card-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                      }
                    }}
                    aria-pressed={selected === c.number}
                    className={clsx(
                      "w-full rounded-xl p-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold",
                      selected === c.number ? "bg-gold/15 ring-1 ring-gold" : "hover:bg-white/5",
                    )}
                  >
                    <OracleCardFace image={c.image} name={c.name} number={c.number} size="sm" />
                    <span className="mt-1.5 flex justify-center gap-1.5 text-[10px]">
                      <span className={c.message ? "text-gold" : "text-ivory-dim/60"}>{c.message ? "● เนื้อหา" : "○ เนื้อหา"}</span>
                      <span className={c.image_status === "ready" ? "text-gold" : c.image_status === "failed" ? "text-red-300" : "text-ivory-dim/60"}>
                        {c.image_status === "ready" ? "● ภาพ" : c.image_status === "failed" ? "! ภาพ" : "○ ภาพ"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div id="card-editor" className="scroll-mt-24 lg:sticky lg:top-6 lg:self-start">
              {card ? (
                <CardEditor
                  key={`${card.number}-${card.image ?? ""}`}
                  card={card}
                  busy={busy}
                  locked={!!job}
                  onWrite={() => act(`write-${card.number}`, () => writeCards([card.number]), "เขียนเนื้อหาใบนี้ใหม่แล้ว")}
                  onPaint={() => act(`paint-${card.number}`, () => paintCard(card.number), "สร้างภาพใบนี้แล้ว")}
                  onSave={(edit) =>
                    act(`save-${card.number}`, () => call(`${base}/cards`, { method: "POST", body: JSON.stringify({ edit }) }), "บันทึกแล้ว")
                  }
                />
              ) : (
                <div className="panel flex min-h-64 items-center justify-center p-6 text-center text-sm text-ivory-dim">
                  เลือกไพ่ทางซ้ายเพื่อดู แก้ไข หรือสร้างภาพใหม่ทีละใบ
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "concept" && (
        <ConceptEditor
          deck={deck}
          busy={busy}
          onSave={(patch) =>
            act("concept", () => call(base, { method: "PATCH", body: JSON.stringify(patch) }), "บันทึกคอนเซปแล้ว — ภาพที่สร้างหลังจากนี้จะใช้แนวภาพใหม่")
          }
        />
      )}

      {tab === "art" && (
        <section role="tabpanel" aria-label="ปกและหลังไพ่" className="grid gap-6 sm:grid-cols-2">
          {(["cover", "back"] as const).map((target) => (
            <div key={target} className="panel flex flex-col items-center gap-4 p-6">
              <h2 className="self-start text-lg font-semibold">{target === "cover" ? "ภาพปกกล่อง" : "ลายหลังไพ่"}</h2>
              {target === "cover" ? (
                <OracleCardFace image={deck.cover_image} name={deck.title} nameEn={deck.title_en} className="w-56" />
              ) : (
                <OracleCardBack image={deck.back_image} className="w-56" />
              )}
              <p className="text-sm text-ivory-dim">
                {target === "cover" ? deck.concept.style?.cover_design : deck.concept.style?.back_design}
              </p>
              <button
                type="button"
                disabled={!!busy || !!job}
                onClick={() =>
                  act(target, () => call(`${base}/image`, { method: "POST", body: JSON.stringify({ target }) }), target === "cover" ? "สร้างภาพปกแล้ว" : "สร้างลายหลังไพ่แล้ว")
                }
                className="btn-ghost mt-auto"
              >
                {busy === target ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {(target === "cover" ? deck.cover_image : deck.back_image) ? "สร้างใหม่" : "ให้ AI สร้างภาพ"}
              </button>
            </div>
          ))}
          <p className="text-xs text-ivory-dim sm:col-span-2">แก้คำบรรยายปกและหลังไพ่ได้ที่แท็บ “คอนเซปและแนวภาพ” แล้วกดสร้างใหม่</p>
        </section>
      )}

      {tab === "publish" && (
        <section role="tabpanel" aria-label="พิมพ์และเผยแพร่" className="grid gap-6 lg:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-lg font-semibold">ความพร้อมของสำรับ</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                [written === deck.card_count, `เนื้อหาไพ่ครบ ${written}/${deck.card_count}`],
                [painted === deck.card_count, `ภาพไพ่ครบ ${painted}/${deck.card_count}`],
                [Boolean(deck.cover_image), "ภาพปกกล่อง"],
                [Boolean(deck.back_image), "ลายหลังไพ่"],
              ].map(([ok, label]) => (
                <li key={String(label)} className="flex items-center gap-2">
                  {ok ? <Check className="h-4 w-4 text-gold" /> : <CircleAlert className="h-4 w-4 text-amber-300" />}
                  <span className={ok ? "text-ivory" : "text-ivory-dim"}>{label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={`/admin/oracle/${deck.id}/print`} target="_blank" rel="noopener" className="btn-ghost">
                <Printer className="h-4 w-4" aria-hidden="true" /> ไฟล์พิมพ์ไพ่และคู่มือ
              </a>
            </div>
            <p className="mt-3 text-xs text-ivory-dim">
              หน้าไฟล์พิมพ์จัดไพ่ขนาด 70×120 มม. (มีระยะตัดตก 3 มม.) หน้าละ 4 ใบ ตามด้วยหลังไพ่และคู่มือ กด “พิมพ์” แล้วเลือกบันทึกเป็น PDF เพื่อส่งโรงพิมพ์
            </p>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold">เผยแพร่ให้ผู้ใช้</h2>
            <p className="mt-2 text-sm text-ivory-dim">
              เมื่อเผยแพร่ สำรับจะแสดงที่หน้า “ไพ่ออราเคิล” ผู้ใช้ดูไพ่ทุกใบและขอสารจากไพ่หนึ่งใบได้ (ระบบสุ่มไพ่ด้วยการสุ่มที่ปลอดภัย AI ไม่ได้เลือกไพ่)
            </p>
            {!allReady && deck.status !== "published" && (
              <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                ไพ่ที่ยังไม่มีเนื้อหาจะไม่ถูกสุ่มให้ผู้ใช้ แนะนำให้ทำให้ครบก่อนเผยแพร่
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!!busy || !!job || written === 0}
                onClick={() =>
                  act(
                    "publish",
                    () => call(base, { method: "PATCH", body: JSON.stringify({ publish: deck.status !== "published" }) }),
                    deck.status === "published" ? "ยกเลิกการเผยแพร่แล้ว" : "เผยแพร่แล้ว",
                  )
                }
                className={deck.status === "published" ? "btn-ghost" : "btn-gold"}
              >
                {busy === "publish" && <Loader2 className="h-4 w-4 animate-spin" />}
                {deck.status === "published" ? "ยกเลิกการเผยแพร่" : "เผยแพร่สำรับนี้"}
              </button>
              {deck.status === "published" && (
                <a href={`/oracle/${deck.slug}`} target="_blank" rel="noopener" className="btn-quiet border border-white/15">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> ดูหน้าผู้ใช้
                </a>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-red-400/20 p-6 lg:col-span-2">
            <h2 className="font-semibold text-red-200">ลบสำรับ</h2>
            <p className="mt-1 text-sm text-ivory-dim">ลบสำรับ ไพ่ และภาพทั้งหมดถาวร กู้คืนไม่ได้</p>
            <button
              type="button"
              disabled={!!busy || !!job}
              onClick={() => {
                if (!window.confirm(`ลบสำรับ “${deck.title}” และภาพทั้งหมดถาวร?`)) return;
                void (async () => {
                  setBusy("delete");
                  try {
                    await call(base, { method: "DELETE" });
                    router.push("/admin/oracle");
                    router.refresh();
                  } catch (err) {
                    say(false, (err as Error).message);
                    setBusy(null);
                  }
                })();
              }}
              className="btn-quiet mt-4 border border-red-400/30 text-red-200"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> ลบสำรับนี้
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function CardEditor({
  card,
  busy,
  locked,
  onWrite,
  onPaint,
  onSave,
}: {
  card: OracleCard;
  busy: string | null;
  locked: boolean;
  onWrite: () => void;
  onPaint: () => void;
  onSave: (edit: Partial<OracleCard> & { number: number; name: string }) => void;
}) {
  const [f, setF] = useState({ ...card, keywordsText: card.keywords.join(", ") });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const disabled = !!busy || locked;

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex gap-4">
        <OracleCardFace image={card.image} name={f.name} nameEn={f.name_en} number={card.number} className="w-36 shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-ivory-dim">ไพ่ใบที่ {card.number}</p>
          <button type="button" onClick={onPaint} disabled={disabled || !card.message} className="btn-ghost justify-start px-3 py-2 text-sm">
            {busy === `paint-${card.number}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {card.image ? "สร้างภาพใหม่" : "สร้างภาพ"}
          </button>
          <button type="button" onClick={onWrite} disabled={disabled} className="btn-quiet justify-start border border-white/15 px-3 py-2 text-sm">
            {busy === `write-${card.number}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {card.message ? "ให้ AI เขียนใหม่" : "ให้ AI เขียน"}
          </button>
          {card.image_status === "failed" && card.image_error && (
            <p className="text-xs text-red-300">ภาพล่าสุดไม่สำเร็จ: {card.image_error.slice(0, 120)}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อไพ่">
          <input value={f.name} onChange={set("name")} maxLength={80} className="field py-2" />
        </Field>
        <Field label="ชื่ออังกฤษ">
          <input value={f.name_en} onChange={set("name_en")} maxLength={80} className="field py-2" />
        </Field>
      </div>
      <Field label="แก่นของไพ่">
        <input value={f.essence} onChange={set("essence")} maxLength={300} className="field py-2" />
      </Field>
      <Field label="คำสำคัญ" hint="คั่นด้วยจุลภาค">
        <input value={f.keywordsText} onChange={set("keywordsText")} className="field py-2" />
      </Field>
      <Field label="ความหมาย">
        <textarea value={f.meaning} onChange={set("meaning")} rows={4} maxLength={2000} className="field resize-y leading-relaxed" />
      </Field>
      <Field label="สารถึงผู้จั่ว">
        <textarea value={f.message} onChange={set("message")} rows={4} maxLength={1200} className="field resize-y leading-relaxed" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="คำยืนยันพลังบวก">
          <textarea value={f.affirmation} onChange={set("affirmation")} rows={2} maxLength={300} className="field resize-y" />
        </Field>
        <Field label="คำถามชวนคิด">
          <textarea value={f.reflection} onChange={set("reflection")} rows={2} maxLength={300} className="field resize-y" />
        </Field>
      </div>
      <Field label="ฉากในภาพ" hint="ภาษาอังกฤษ ใช้สั่ง AI วาดภาพ">
        <textarea value={f.visual} onChange={set("visual")} rows={3} maxLength={1200} className="field resize-y font-mono text-xs" />
      </Field>

      <button
        type="button"
        disabled={disabled || !f.name.trim()}
        onClick={() =>
          onSave({
            number: card.number,
            name: f.name.trim(),
            name_en: f.name_en.trim(),
            essence: f.essence.trim(),
            keywords: f.keywordsText.split(/[,，]/).map((k) => k.trim()).filter(Boolean).slice(0, 8),
            meaning: f.meaning.trim(),
            message: f.message.trim(),
            affirmation: f.affirmation.trim(),
            reflection: f.reflection.trim(),
            visual: f.visual.trim(),
          })
        }
        className="btn-gold w-full"
      >
        {busy === `save-${card.number}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        บันทึกไพ่ใบนี้
      </button>
    </div>
  );
}

function ConceptEditor({
  deck,
  busy,
  onSave,
}: {
  deck: OracleDeck;
  busy: string | null;
  onSave: (patch: { title: string; title_en: string; tagline: string; concept: Partial<OracleConcept> }) => void;
}) {
  const c = deck.concept;
  const [title, setTitle] = useState(deck.title);
  const [titleEn, setTitleEn] = useState(deck.title_en);
  const [tagline, setTagline] = useState(deck.tagline);
  const [story, setStory] = useState(c.story ?? "");
  const [howTo, setHowTo] = useState(c.how_to_use ?? "");
  const [intro, setIntro] = useState(c.guidebook_intro ?? "");
  const [themes, setThemes] = useState((c.themes ?? []).join(", "));
  const [audience, setAudience] = useState(c.audience ?? "");
  const [tone, setTone] = useState(c.tone ?? "");
  const [art, setArt] = useState(c.style?.art_direction ?? "");
  const [palette, setPalette] = useState(c.style?.palette ?? []);
  const [motifs, setMotifs] = useState((c.style?.motifs ?? []).join(", "));
  const [composition, setComposition] = useState(c.style?.composition ?? "");
  const [coverDesign, setCoverDesign] = useState(c.style?.cover_design ?? "");
  const [backDesign, setBackDesign] = useState(c.style?.back_design ?? "");
  const list = (s: string) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  const validPalette = useMemo(() => palette.every((p) => /^#[0-9a-fA-F]{6}$/.test(p.hex)), [palette]);

  return (
    <section role="tabpanel" aria-label="คอนเซปและแนวภาพ" className="grid gap-6 lg:grid-cols-2">
      <div className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">เรื่องราวของสำรับ</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อสำรับ">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="field py-2" />
          </Field>
          <Field label="ชื่ออังกฤษ">
            <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} maxLength={120} className="field py-2" />
          </Field>
        </div>
        <Field label="คำโปรย">
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={300} className="field py-2" />
        </Field>
        <Field label="แนวคิดและเรื่องราว">
          <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={5} maxLength={1800} className="field resize-y leading-relaxed" />
        </Field>
        <Field label="วิธีใช้สำรับ">
          <textarea value={howTo} onChange={(e) => setHowTo(e.target.value)} rows={4} maxLength={1500} className="field resize-y leading-relaxed" />
        </Field>
        <Field label="บทนำคู่มือ">
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} maxLength={1800} className="field resize-y leading-relaxed" />
        </Field>
        <Field label="ธีม" hint="คั่นด้วยจุลภาค">
          <input value={themes} onChange={(e) => setThemes(e.target.value)} className="field py-2" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="สำหรับใคร">
            <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={300} className="field py-2" />
          </Field>
          <Field label="น้ำเสียง">
            <input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={200} className="field py-2" />
          </Field>
        </div>
      </div>

      <div className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">แนวภาพ (ใช้กับทุกภาพในสำรับ)</h2>
        <Field label="ทิศทางศิลป์" hint="ภาษาอังกฤษ">
          <textarea value={art} onChange={(e) => setArt(e.target.value)} rows={4} maxLength={900} className="field resize-y font-mono text-xs" />
        </Field>
        <fieldset>
          <legend className="text-sm text-ivory">ชุดสี</legend>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {palette.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="h-9 w-9 shrink-0 rounded-md border border-white/20" style={{ background: /^#[0-9a-fA-F]{6}$/.test(p.hex) ? p.hex : "transparent" }} aria-hidden="true" />
                <input
                  value={p.hex}
                  onChange={(e) => setPalette((ps) => ps.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
                  className="field w-28 py-2 font-mono text-xs"
                  aria-label={`รหัสสี ${p.name}`}
                />
                <input
                  value={p.name}
                  onChange={(e) => setPalette((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="field min-w-0 flex-1 py-2 text-xs"
                  aria-label="ชื่อสี"
                />
              </li>
            ))}
          </ul>
          {!validPalette && <p className="mt-1 text-xs text-red-300">รหัสสีต้องเป็นรูปแบบ #RRGGBB</p>}
        </fieldset>
        <Field label="ลวดลาย/สัญลักษณ์ที่ใช้ซ้ำ" hint="ภาษาอังกฤษ คั่นด้วยจุลภาค">
          <input value={motifs} onChange={(e) => setMotifs(e.target.value)} className="field py-2 font-mono text-xs" />
        </Field>
        <Field label="การจัดองค์ประกอบ" hint="ภาษาอังกฤษ">
          <textarea value={composition} onChange={(e) => setComposition(e.target.value)} rows={3} maxLength={600} className="field resize-y font-mono text-xs" />
        </Field>
        <Field label="ภาพปก" hint="ภาษาอังกฤษ">
          <textarea value={coverDesign} onChange={(e) => setCoverDesign(e.target.value)} rows={2} maxLength={600} className="field resize-y font-mono text-xs" />
        </Field>
        <Field label="ลายหลังไพ่" hint="ภาษาอังกฤษ">
          <textarea value={backDesign} onChange={(e) => setBackDesign(e.target.value)} rows={2} maxLength={600} className="field resize-y font-mono text-xs" />
        </Field>
      </div>

      <div className="lg:col-span-2">
        <button
          type="button"
          disabled={!!busy || !validPalette || !title.trim()}
          onClick={() =>
            onSave({
              title: title.trim(),
              title_en: titleEn.trim(),
              tagline: tagline.trim(),
              concept: {
                story,
                how_to_use: howTo,
                guidebook_intro: intro,
                themes: list(themes).slice(0, 8),
                audience,
                tone,
                style: {
                  art_direction: art,
                  palette,
                  motifs: list(motifs).slice(0, 10),
                  composition,
                  cover_design: coverDesign,
                  back_design: backDesign,
                },
              },
            })
          }
          className="btn-gold"
        >
          {busy === "concept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          บันทึกคอนเซปและแนวภาพ
        </button>
      </div>
    </section>
  );
}
