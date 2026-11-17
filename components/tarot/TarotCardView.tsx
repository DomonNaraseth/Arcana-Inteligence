"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import clsx from "clsx";
import type { Orientation, TarotCard } from "@/lib/tarot/types";
import { CardBack } from "./CardBack";

interface Props {
  card: TarotCard;
  orientation: Orientation;
  revealed: boolean;
  onClick?: () => void;
  /** tailwind width class, height follows the RWS aspect ratio */
  widthClass?: string;
  ariaLabel?: string;
  skipAnimation?: boolean;
  priority?: boolean;
}

export function TarotCardView({
  card,
  orientation,
  revealed,
  onClick,
  widthClass = "w-28 sm:w-36",
  ariaLabel,
  skipAnimation,
  priority,
}: Props) {
  const label =
    ariaLabel ??
    (revealed
      ? `${card.name} ${orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"}`
      : "ไพ่คว่ำ แตะเพื่อเปิด");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={clsx(
        "card-scene group relative block aspect-[10/17] shrink-0 rounded-xl",
        widthClass,
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={
          skipAnimation ? { duration: 0 } : { duration: 0.75, ease: [0.4, 0.1, 0.2, 1] }
        }
      >
        {/* back */}
        <div
          className={clsx(
            "card-face absolute inset-0 overflow-hidden rounded-xl shadow-card transition-shadow duration-300",
            !revealed && onClick && "group-hover:shadow-glow",
          )}
        >
          <CardBack className="h-full w-full" />
        </div>
        {/* front */}
        <div
          className="card-face absolute inset-0 overflow-hidden rounded-xl border border-gold/50 bg-ivory shadow-card"
          style={{ transform: "rotateY(180deg)" }}
        >
          <Image
            src={card.image}
            alt={`${card.name} (${card.nameTh})`}
            fill
            sizes="(max-width: 640px) 40vw, 220px"
            priority={priority}
            className={clsx("object-cover", orientation === "reversed" && "rotate-180")}
          />
        </div>
      </motion.div>
    </button>
  );
}
