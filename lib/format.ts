export function formatThaiDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Asia/Bangkok",
  }).format(d);
}

/** YYYY-MM-DD in Bangkok time — used to seed the daily card. */
export function bangkokDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
}
