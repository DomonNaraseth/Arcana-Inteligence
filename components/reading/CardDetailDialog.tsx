"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { ELEMENT_TH, SUIT_TH } from "@/lib/tarot/deck";
import type { Orientation, TarotCard } from "@/lib/tarot/types";

interface Props {
  card: TarotCard;
  orientation: Orientation;
  positionName?: string;
  positionMeaning?: string;
  onClose: () => void;
}

export function CardDetailDialog({ card, orientation, positionName, positionMeaning, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const reversed = orientation === "reversed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-title"
        className="panel-gold relative max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-b-none bg-navy p-6 sm:rounded-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-4 top-4 rounded-full p-2 text-ivory-dim hover:bg-white/10 hover:text-ivory"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex gap-5">
          <div className="relative aspect-[10/17] w-28 shrink-0 overflow-hidden rounded-xl border border-gold/50 shadow-card sm:w-36">
            <Image
              src={card.image}
              alt={card.name}
              fill
              sizes="160px"
              className={reversed ? "rotate-180 object-cover" : "object-cover"}
            />
          </div>
          <div className="min-w-0 pr-8">
            {positionName && <p className="eyebrow">{positionName}</p>}
            <h2 id="card-dialog-title" className="mt-1 text-2xl font-semibold text-gold-light">
              {card.name}
            </h2>
            <p className="text-ivory-dim">
              {card.nameTh} · {reversed ? "กลับหัว" : "ตั้งตรง"}
            </p>
            <p className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="chip">{card.arcana === "major" ? "Major Arcana" : "Minor Arcana"}</span>
              {card.suit && <span className="chip">ชุด{SUIT_TH[card.suit]}</span>}
              <span className="chip">ธาตุ{ELEMENT_TH[card.element]}</span>
            </p>
            {positionMeaning && (
              <p className="mt-3 text-sm text-ivory-dim">ตำแหน่งนี้หมายถึง: {positionMeaning}</p>
            )}
          </div>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-gold">
              ความหมายตามขนบ ({reversed ? "กลับหัว" : "ตั้งตรง"})
            </dt>
            <dd className="mt-1 text-ivory">{reversed ? card.reversedTh : card.uprightTh}</dd>
          </div>
          <div>
            <dt className="font-medium text-gold">คำสำคัญ</dt>
            <dd className="mt-1 text-ivory-dim">
              {(reversed ? card.keywordsReversed : card.keywords).join(" · ")}
            </dd>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-gold">ความรัก</dt>
              <dd className="mt-1 text-ivory-dim">{card.loveTh}</dd>
            </div>
            <div>
              <dt className="font-medium text-gold">การงาน</dt>
              <dd className="mt-1 text-ivory-dim">{card.careerTh}</dd>
            </div>
            <div>
              <dt className="font-medium text-gold">การเงิน</dt>
              <dd className="mt-1 text-ivory-dim">{card.financeTh}</dd>
            </div>
          </div>
          <div>
            <dt className="font-medium text-gold">คำแนะนำจากไพ่</dt>
            <dd className="mt-1 text-ivory">{card.adviceTh}</dd>
          </div>
        </dl>

        <Link href={`/cards/${card.id}`} className="mt-6 inline-block text-sm text-gold hover:text-gold-light">
          ดูหน้าไพ่ใบนี้ในคลังไพ่ →
        </Link>
      </div>
    </div>
  );
}
