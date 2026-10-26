import type { SeriesPoint } from "./types";

const londonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const londonHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

export const fmtLondon = (iso: string) => londonTime.format(new Date(iso));

export const fmtHour = (iso: string) => londonHour.format(new Date(iso));

export const fmtMW = (v: number | null | undefined) =>
  v == null ? "–" : `${Math.round(v).toLocaleString("en-GB")} MW`;

export const fmtPct = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)}%`);

/** Bin forecast errors (MW) into fixed-width buckets for a histogram. */
export function errorHistogram(
  series: SeriesPoint[],
  binWidth = 1000,
): { bin: number; label: string; count: number }[] {
  const counts = new Map<number, number>();
  for (const p of series) {
    if (p.error == null) continue;
    const bin = Math.floor(p.error / binWidth) * binWidth;
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const lo = Math.min(...counts.keys());
  const hi = Math.max(...counts.keys());
  const out = [];
  for (let b = lo; b <= hi; b += binWidth) {
    out.push({ bin: b, label: `${b / 1000}k`, count: counts.get(b) ?? 0 });
  }
  return out;
}

export function toCsv(series: SeriesPoint[]): string {
  const header = "startTime,publishTime,lead_hours,forecast_mw,actual_mw,error_mw";
  const rows = series.map((p) =>
    [p.startTime, p.publishTime, p.lead_hours, p.forecast, p.actual ?? "", p.error ?? ""].join(","),
  );
  return [header, ...rows].join("\n");
}
