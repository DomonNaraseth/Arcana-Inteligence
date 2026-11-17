"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

interface CardSummary {
  id: string;
  name: string;
  nameTh: string;
  arcana: "major" | "minor";
  suit: "wands" | "cups" | "swords" | "pentacles" | null;
  image: string;
  keywords: string[];
}

const FILTERS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "major", label: "Major Arcana" },
  { id: "wands", label: "ไม้เท้า" },
  { id: "cups", label: "ถ้วย" },
  { id: "swords", label: "ดาบ" },
  { id: "pentacles", label: "เหรียญ" },
] as const;

export function CardLibrary({ cards }: { cards: CardSummary[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter === "major" && c.arcana !== "major") return false;
      if (filter !== "all" && filter !== "major" && c.suit !== filter) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.nameTh.includes(term) ||
        c.keywords.some((k) => k.toLowerCase().includes(term))
      );
    });
  }, [cards, filter, q]);

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองชุดไพ่">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                filter === f.id
                  ? "border-gold bg-gold/15 text-gold-light"
                  : "border-white/15 text-ivory-dim hover:border-gold/40",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="sm:w-64">
          <span className="sr-only">ค้นหาไพ่</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อไพ่…"
            className="field py-2"
          />
        </label>
      </div>

      <p className="mt-4 text-sm text-ivory-dim" aria-live="polite">
        แสดง {visible.length} ใบ
      </p>

      <ul className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {visible.map((c) => (
          <li key={c.id}>
            <Link href={`/cards/${c.id}`} className="group block">
              <div className="relative aspect-[10/17] overflow-hidden rounded-xl border border-gold/30 shadow-card transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-gold">
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 30vw, 180px"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 text-center text-xs font-medium text-ivory group-hover:text-gold-light sm:text-sm">
                {c.name}
              </p>
              <p className="text-center text-[11px] text-ivory-dim">{c.nameTh}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
