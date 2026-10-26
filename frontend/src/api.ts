import type { AccuracyResponse, ForecastResponse } from "./types";

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`/api/${path}?${qs}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const getForecast = (day: string, cutoffHour: number) =>
  get<ForecastResponse>("forecast", { day, cutoff_hour: cutoffHour });
export const getAccuracy = (from: string, to: string, cutoffHour: number) =>
  get<AccuracyResponse>("accuracy", { from, to, cutoff_hour: cutoffHour });
