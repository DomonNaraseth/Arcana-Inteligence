"use client";

import { useState } from "react";

export interface DailyPoint {
  day: string; // YYYY-MM-DD (Bangkok)
  readings: number;
  users: number;
}

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const f = n / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

const dayFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const label = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

/**
 * Single-series column chart: readings per day. One hue, bars anchored to the
 * baseline, a hit target taller than the mark, tooltip on hover/focus, and a
 * table view for the exact numbers.
 */
export function DailyBars({ data }: { data: DailyPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.readings), 0));
  const total = data.reduce((s, d) => s + d.readings, 0);
  const ticks = [0, Math.floor(data.length / 2), data.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i && data[v],
  );
  const point = active !== null ? data[active] : null;

  if (total === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center text-sm text-ivory-dim">
        ยังไม่มีการอ่านไพ่ในช่วงเวลานี้
      </p>
    );
  }

  return (
    <figure>
      <div className="flex gap-3">
        {/* y axis — recessive */}
        <div className="flex h-44 w-7 shrink-0 flex-col justify-between text-right text-[11px] leading-none text-ivory-dim/70">
          <span>{max}</span>
          <span>{max / 2}</span>
          <span>0</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            <span className="h-px bg-white/[0.07]" />
            <span className="h-px bg-white/[0.07]" />
            <span className="h-px bg-white/20" />
          </div>

          <div
            className="relative flex h-44 items-end gap-[2px]"
            role="img"
            aria-label={`กราฟแท่งจำนวนการอ่านไพ่ต่อวัน ${data.length} วันล่าสุด รวม ${total} ครั้ง`}
            onMouseLeave={() => setActive(null)}
          >
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 flex-1 items-end outline-none"
                aria-label={`${label(d.day)}: ${d.readings} ครั้ง`}
              >
                <span
                  className="block w-full rounded-t-[4px] transition-colors"
                  style={{
                    height: d.readings > 0 ? `${Math.max((d.readings / max) * 100, 2)}%` : "2px",
                    background:
                      d.readings === 0
                        ? "rgba(240,233,218,0.14)"
                        : active === i
                          ? "#E3C98F"
                          : "#C6A15B",
                  }}
                />
              </button>
            ))}

            {point && active !== null && (
              <div
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/15 bg-midnight px-3 py-2 text-xs shadow-card"
                style={{
                  left: `clamp(60px, ${((active + 0.5) / data.length) * 100}%, calc(100% - 60px))`,
                }}
                role="status"
              >
                <p className="text-ivory-dim">{label(point.day)}</p>
                <p className="mt-0.5 text-ivory">
                  <span className="text-sm font-semibold">{point.readings}</span> การอ่านไพ่
                </p>
                <p className="text-ivory-dim">{point.users} ผู้ใช้</p>
              </div>
            )}
          </div>

          {/* x axis — a few labels, not one per bar */}
          <div className="relative mt-2 h-4 text-[11px] text-ivory-dim/70">
            {ticks.map((t, i) => (
              <span
                key={t}
                className="absolute whitespace-nowrap"
                style={
                  i === 0
                    ? { left: 0 }
                    : t === data.length - 1
                      ? { right: 0 }
                      : { left: `${((t + 0.5) / data.length) * 100}%`, transform: "translateX(-50%)" }
                }
              >
                {label(data[t].day)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-gold hover:text-gold-light">ดูเป็นตาราง</summary>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-navy text-xs text-ivory-dim">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">วันที่</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">การอ่านไพ่</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">ผู้ใช้</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="px-4 py-1.5 text-ivory-dim">{label(d.day)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-ivory">{d.readings}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-ivory">{d.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
