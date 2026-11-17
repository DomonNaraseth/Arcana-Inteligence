/** Ornamental card back — original ARCANA artwork (no third-party assets). */
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 340"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cb-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1F3453" />
          <stop offset="1" stopColor="#101827" />
        </linearGradient>
        <pattern id="cb-lattice" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M10 0 L20 10 L10 20 L0 10 Z" fill="none" stroke="#C6A15B" strokeWidth="0.4" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="200" height="340" rx="12" fill="url(#cb-bg)" />
      <rect x="8" y="8" width="184" height="324" rx="8" fill="url(#cb-lattice)" />
      <rect x="8" y="8" width="184" height="324" rx="8" fill="none" stroke="#C6A15B" strokeWidth="1.2" />
      <rect x="14" y="14" width="172" height="312" rx="5" fill="none" stroke="#C6A15B" strokeWidth="0.5" opacity="0.6" />
      <circle cx="100" cy="170" r="52" fill="#101827" stroke="#C6A15B" strokeWidth="1" />
      <circle cx="100" cy="170" r="44" fill="none" stroke="#C6A15B" strokeWidth="0.5" opacity="0.7" />
      <path
        d="M100 122 L107 163 L148 170 L107 177 L100 218 L93 177 L52 170 L93 163 Z"
        fill="#C6A15B"
      />
      <path
        d="M100 140 L104 166 L130 170 L104 174 L100 200 L96 174 L70 170 L96 166 Z"
        fill="#101827"
        opacity="0.55"
      />
      <circle cx="100" cy="170" r="4" fill="#E3C98F" />
      {[40, 300].map((y) => (
        <g key={y}>
          <path d={`M100 ${y - 12} L104 ${y} L100 ${y + 12} L96 ${y} Z`} fill="#C6A15B" opacity="0.85" />
          <circle cx="78" cy={y} r="1.6" fill="#C6A15B" />
          <circle cx="122" cy={y} r="1.6" fill="#C6A15B" />
        </g>
      ))}
    </svg>
  );
}
