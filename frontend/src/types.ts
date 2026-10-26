export interface Metrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  bias: number | null;
  p90_abs_error: number | null;
}

export interface SeriesPoint {
  startTime: string;
  publishTime: string;
  forecast: number;
  actual: number | null;
  error: number | null;
  lead_hours: number;
}

export interface AccuracyResponse {
  cutoff_hour: number;
  overall: Metrics;
  daily: (Metrics & { day: string })[];
  hourly: (Metrics & { hour: number })[];
  horizon: (Metrics & { bucket: string })[];
  series: SeriesPoint[];
}

export interface ForecastResponse {
  day: string;
  cutoff_hour: number;
  cutoff_utc: string;
  series: SeriesPoint[];
}
