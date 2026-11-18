import Image from "next/image";
import clsx from "clsx";
import type { Orientation } from "@/lib/tarot/types";

/** A small, static picture of a drawn card (reversed cards shown upside down). */
export function CardThumb({
  image,
  alt,
  orientation,
  className = "w-14",
  sizes = "64px",
  badge,
}: {
  image: string;
  alt: string;
  orientation?: Orientation;
  className?: string;
  sizes?: string;
  /** e.g. the position number, shown in a corner */
  badge?: string | number;
}) {
  return (
    <span
      className={clsx(
        "relative block aspect-[10/17] shrink-0 overflow-hidden rounded-md border border-gold/40 bg-ivory shadow-card",
        className,
      )}
    >
      <Image
        src={image}
        alt={alt}
        fill
        sizes={sizes}
        className={clsx("object-cover", orientation === "reversed" && "rotate-180")}
      />
      {badge !== undefined && (
        <span
          className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-midnight/85 px-1 font-serif text-[11px] leading-none text-gold ring-1 ring-gold/50"
          aria-hidden="true"
        >
          {badge}
        </span>
      )}
    </span>
  );
}
