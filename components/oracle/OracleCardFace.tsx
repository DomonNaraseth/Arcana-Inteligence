import clsx from "clsx";
import { ImageOff } from "lucide-react";
import { oracleImageUrl } from "@/lib/oracle/schemas";

/**
 * An oracle card as the site prints it: the AI painting full-bleed, and the
 * name set in real Thai type on a band at the foot — image models cannot write
 * Thai, so lettering is never part of the painting.
 */
export function OracleCardFace({
  image,
  name,
  nameEn,
  number,
  className,
  size = "md",
  priority,
  bleed,
}: {
  image: string | null;
  name: string;
  nameEn?: string;
  number?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  priority?: boolean;
  /** print: fill the parent edge to edge, square corners (the cutter rounds them) */
  bleed?: boolean;
}) {
  return (
    <figure
      className={clsx(
        "relative isolate overflow-hidden bg-navy",
        bleed ? "h-full w-full" : "aspect-[7/12] rounded-[6%/3.5%] border border-gold/50 shadow-card",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from our own API, drafts need the admin's cookie
        <img
          src={oracleImageUrl(image)}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_35%,rgba(198,161,91,0.18),transparent_60%)] text-ivory-dim">
          <ImageOff className="h-6 w-6 opacity-60" aria-hidden="true" />
          <span className="text-[11px]">ยังไม่มีภาพ</span>
        </div>
      )}
      {/* inner gold rule (inside the safe area when printed with bleed) */}
      <div
        className={clsx("pointer-events-none absolute rounded-[5%/3%] border border-gold/40", bleed ? "inset-[7%]" : "inset-[3.5%]")}
        aria-hidden="true"
      />
      {number !== undefined && (
        <span
          className={clsx(
            "absolute left-1/2 top-[4.5%] -translate-x-1/2 rounded-full bg-midnight/75 px-2 font-serif text-gold ring-1 ring-gold/40 backdrop-blur-sm",
            size === "sm" ? "text-[10px]" : "text-xs",
          )}
        >
          {number}
        </span>
      )}
      <figcaption
        className={clsx(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-midnight via-midnight/90 to-transparent text-center",
          size === "sm" ? "px-2 pb-2.5 pt-6" : size === "lg" ? "px-5 pb-6 pt-14" : "px-3 pb-4 pt-10",
        )}
      >
        <span
          className={clsx(
            "block font-serif font-semibold leading-tight text-ivory",
            size === "sm" ? "text-[13px]" : size === "lg" ? "text-2xl" : "text-base",
          )}
        >
          {name}
        </span>
        {nameEn && size !== "sm" && (
          <span className={clsx("mt-1 block uppercase tracking-[0.2em] text-gold/90", size === "lg" ? "text-xs" : "text-[9px]")}>
            {nameEn}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** The back of an oracle card: the deck's painted back, or a plain gold emblem until one exists. */
export function OracleCardBack({ image, className, bleed }: { image: string | null; className?: string; bleed?: boolean }) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-navy",
        bleed ? "h-full w-full" : "aspect-[7/12] rounded-[6%/3.5%] border border-gold/50 shadow-card",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- see OracleCardFace
        <img src={oracleImageUrl(image)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle,rgba(198,161,91,0.25),transparent_65%)]">
          <span className="h-1/4 w-1/4 rotate-45 border border-gold/60" aria-hidden="true" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-[3.5%] rounded-[5%/3%] border border-gold/40" aria-hidden="true" />
    </div>
  );
}
