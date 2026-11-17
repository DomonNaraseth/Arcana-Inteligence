import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReadingRow } from "@/lib/data/readings";
import { formatThaiDate } from "@/lib/format";
import { getContext } from "@/lib/supabase/server";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = { title: "ประวัติการอ่านไพ่" };

type Row = Pick<ReadingRow, "id" | "question" | "spread_id" | "status" | "title" | "tendency" | "created_at">;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim().slice(0, 80);
  const { supabase } = await getContext();
  const kb = await getKnowledge(supabase);

  let query = supabase
    .from("arcana_readings")
    .select("id, question, spread_id, status, title, tendency, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (term) {
    const safe = term.replace(/[%_,()]/g, " ");
    query = query.or(`question.ilike.%${safe}%,title.ilike.%${safe}%`);
  }
  const { data, error } = await query.returns<Row[]>();
  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">Reading History</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">ประวัติการอ่านไพ่</h1>
      <p className="mt-2 text-ivory-dim">ไพ่และคำอ่านทุกครั้งถูกบันทึกไว้ตามจริง ไม่มีการแก้ไขย้อนหลัง</p>

      <form className="mt-6 flex gap-3" role="search">
        <label htmlFor="history-q" className="sr-only">
          ค้นหาคำถาม
        </label>
        <input
          id="history-q"
          name="q"
          defaultValue={term}
          placeholder="ค้นหาจากคำถามหรือหัวเรื่อง"
          className="field"
        />
        <button type="submit" className="btn-ghost shrink-0">
          ค้นหา
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          โหลดประวัติไม่สำเร็จ กรุณารีเฟรชหน้านี้
        </p>
      )}

      {rows.length === 0 && !error ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
          <p className="text-ivory-dim">
            {term ? `ไม่พบการอ่านไพ่ที่ตรงกับ “${term}”` : "ยังไม่มีประวัติการอ่านไพ่"}
          </p>
          <Link href="/ask" className="mt-4 inline-flex items-center gap-1 text-gold hover:text-gold-light">
            เริ่มถามไพ่ <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reading/${r.id}`}
                className="panel group block p-5 transition-colors hover:border-gold/40"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ivory-dim">
                  <span>{formatThaiDate(r.created_at, true)}</span>
                  <span className="text-gold">{kb.spread(r.spread_id)?.nameTh ?? r.spread_id}</span>
                  {r.status === "interpreted" && r.tendency ? (
                    <span className="chip">{r.tendency}</span>
                  ) : (
                    <span className="chip border-white/20 bg-white/5 text-ivory-dim">รออ่านไพ่</span>
                  )}
                </div>
                <p className="mt-2 text-lg font-medium text-ivory group-hover:text-gold-light">
                  {r.title ?? r.question}
                </p>
                {r.title && <p className="mt-1 line-clamp-1 text-sm text-ivory-dim">“{r.question}”</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
