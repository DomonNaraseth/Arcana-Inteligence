import Link from "next/link";

export function Sigil({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <circle cx="24" cy="24" r="22" stroke="#C6A15B" strokeWidth="1" opacity="0.5" />
      <circle cx="24" cy="24" r="15" stroke="#C6A15B" strokeWidth="1" />
      <path
        d="M24 4 L27.2 20.8 L44 24 L27.2 27.2 L24 44 L20.8 27.2 L4 24 L20.8 20.8 Z"
        fill="#C6A15B"
        opacity="0.9"
      />
      <circle cx="24" cy="24" r="3" fill="#101827" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3" aria-label="ARCANA INTELLIGENCE">
      <Sigil className="h-8 w-8 transition-transform duration-500 group-hover:rotate-45" />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-xl font-semibold tracking-[0.22em] text-ivory">
          ARCANA
        </span>
        <span className="mt-1 text-[9px] tracking-[0.42em] text-gold">INTELLIGENCE</span>
      </span>
    </Link>
  );
}
