/**
 * Ranked horizontal bars with direct labels. One hue: the bar encodes
 * magnitude, the text (in text tokens) carries name and value.
 */
export function BarList({
  items,
  emptyText = "ยังไม่มีข้อมูล",
  unit = "",
}: {
  items: { label: string; value: number }[];
  emptyText?: string;
  unit?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ivory-dim">{emptyText}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ivory">{item.label}</span>
            <span className="shrink-0 tabular-nums text-ivory">
              {item.value.toLocaleString("th-TH")}
              {unit}
              <span className="ml-2 text-xs text-ivory-dim">
                {total > 0 ? Math.round((item.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${Math.max((item.value / max) * 100, 1.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
