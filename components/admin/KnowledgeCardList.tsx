"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

interface Item {
  id: string;
  name: string;
  nameTh: string;
  arcana: "major" | "minor";
  suit: "wands" | "cups" | "swords" | "pentacles" | null;
  image: string;
  edited: boolean;
}

const FILTERS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "edited", label: "ที่แก้แล้ว" },
  { id: "major", label: "Major Arcana" },
  { id: "wands", label: "ไม้เท้า" },
  { id: "cups", label: "ถ้วย" },
  { id: "swords", label: "ดาบ" },
  { id: "pentacles", label: "เหรียญ" },
] as const;

export function KnowledgeCardList({ cards }: { cards: Item[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter === "edited" && !c.edited) return false;
      if (filter === "major" && c.arcana !== "major") return false;
      if (!["all", "edited", "major"].includes(filter) && c.suit !== filter) return false;
      return !term || c.name.toLowerCase().includes(term) || c.nameTh.includes(term);
    });
  }, [cards, filter, q]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองไพ่">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                filter === f.id
                  ? "border-gold bg-gold/15 text-gold-light"
                  : "border-white/15 text-ivory-dim hover:border-gold/40",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="sm:w-60">
          <span className="sr-only">ค้นหาไพ่</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อไพ่…" className="field py-2 text-sm" />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-ivory-dim">
          {filter === "edited" ? "ยังไม่มีไพ่ที่ถูกแก้ไข" : "ไม่พบไพ่ที่ค้นหา"}
        </p>
      ) : (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/knowledge/cards/${c.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-navy/50 p-2.5 transition-colors hover:border-gold/40"
              >
                <span className="relative block aspect-[10/17] w-9 shrink-0 overflow-hidden rounded border border-gold/30">
                  <Image src={c.image} alt="" fill sizes="40px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ivory">{c.name}</span>
                  <span className="block truncate text-xs text-ivory-dim">{c.nameTh}</span>
                </span>
                {c.edited && <span className="chip shrink-0">แก้แล้ว</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
