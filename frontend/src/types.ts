export interface Metrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  bias: number | null;
  p90_abs_error: number | null;
  mape_n?: number;
  wape?: number | null;
  over_forecast_share?: number | null;
  mean_over_error?: number | null;
  mean_under_error?: number | null;
  coverage?: {
    matched_hours: number;
    missing_actual_hours: number;
    incomplete_actual_hours: number;
  };
}

export type Calibration = "retrospective" | "prior";

export interface ResponseMeta {
  skipped_records?: number;
}

export interface SeriesPoint {
  startTime: string;
  publishTime: string;
  forecast: number;
  actual: number | null;
  error: number | null;
  lead_hours: number;
  forecast_age_hours?: number;
  actual_complete?: boolean;
}

export interface AccuracyResponse {
  cutoff_hour: number;
  overall: Metrics;
  daily: (Metrics & { day: string })[];
  hourly: (Metrics & { hour: number })[];
  horizon: (Metrics & { bucket: string; distinct_hours?: number; sparse?: boolean })[];
  horizon_excluded?: number;
  meta?: ResponseMeta;
  series: SeriesPoint[];
}

export interface ForecastResponse {
  day: string;
  cutoff_hour: number;
  cutoff_utc: string;
  series: SeriesPoint[];
  calibration?: Calibration;
  p90_abs_error?: number | null;
  calibration_days?: number;
  calibration_note?: string | null;
  meta?: ResponseMeta;
}
