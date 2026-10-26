import { useState, type ComponentProps } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getForecast } from "../api";
import type { Calibration } from "../types";
import { fmtHour, fmtLondon, fmtMW } from "../format";
import { useAsync } from "../useAsync";
import { ChartCard, SERIES_1, SERIES_2, gridProps, legendProps, tooltipProps, xAxisProps, yAxisProps, yScale } from "./chartKit";
import { Kpi, Status } from "./Kpi";

// The band is series-1 at 14% opacity; the legend swatch uses the same tint so the key matches the plot.
const BAND_COLOR = "color-mix(in srgb, var(--series-1) 14%, transparent)";

// Custom legend entries (recharts reads payload.strokeDasharray for line icons).
const legendEntries = (hasActuals: boolean) =>
  [
    { value: "Forecast (at cutoff)", type: "plainline", color: SERIES_1, id: "forecast", payload: { strokeDasharray: "" } },
    ...(hasActuals
      ? [{ value: "Actual", type: "plainline", color: SERIES_2, id: "actual", payload: { strokeDasharray: "" } }]
      : []),
    { value: "Historical error (± P90)", type: "square", color: BAND_COLOR, id: "band", payload: { strokeDasharray: "" } },
  ] as unknown as NonNullable<ComponentProps<typeof Legend>["payload"]>;

interface Props {
  day: string;
  cutoffHour: number;
  calibration: Calibration;
}

export function DecisionView({ day, cutoffHour, calibration }: Props) {
  const [retryForecast, setRetryForecast] = useState(0);
  const fc = useAsync(() => getForecast(day, cutoffHour, calibration), [day, cutoffHour, calibration, retryForecast]);

  const p90 = fc.data?.p90_abs_error ?? null;
  const bandMode = fc.data?.calibration ?? calibration;
  const series = fc.data?.series ?? [];
  const chart = series.map((p) => ({
    t: fmtHour(p.startTime),
    forecast: p.forecast,
    actual: p.actual,
    band: p90 == null ? undefined : [Math.max(0, p.forecast - p90), p.forecast + p90],
  }));
  const avg = series.length ? series.reduce((s, p) => s + p.forecast, 0) / series.length : null;
  const peak = series.length ? Math.max(...series.map((p) => p.forecast)) : null;
  const peakHour = series.find((p) => p.forecast === peak);
  const latestPublish = series.length ? series.map((p) => p.publishTime).sort().pop()! : null;
  const hasActuals = series.some((p) => p.actual != null);

  return (
    <section aria-label="Buying decision results" aria-busy={fc.loading}>
      <Status loading={fc.loading} error={fc.error} hasData={!!fc.data} onRetry={() => setRetryForecast((n) => n + 1)} />
      {fc.data && (
        <div className={fc.loading ? "stale" : ""}>
          <div className="result-context"><h3>Delivery · {fc.data.day}</h3><span>Decision cutoff: <strong>{fmtLondon(fc.data.cutoff_utc)} UK</strong></span></div>
          <div className="kpis decision-kpis">
            <Kpi prominent label="Average forecast wind" value={fmtMW(avg)} hint="Expected supply · mean of available hourly forecasts" />
            <Kpi label="Peak forecast wind" value={fmtMW(peak)} hint={peakHour ? `Highest forecast hour · ${fmtHour(peakHour.startTime)} UK` : "No forecast hours available"} />
            <Kpi label="Historical error · P90" value={fmtMW(p90)} hint={`${fc.data.calibration_days ?? "–"} matched delivery days · ${bandMode === "prior" ? "prior days only" : "all January"}`} />
            <Kpi label="Latest forecast publication" value={latestPublish ? fmtLondon(latestPublish) : "–"} hint="Most recent selected publication · UK time" />
          </div>
          {p90 == null && <p className="banner" role="status">{fc.data.calibration_note ?? "No historical error range is available for this selection."}</p>}
          <ChartCard
            title="Wind supply through the delivery day"
            subtitle={`Forecast selected at the D−1 cutoff · ${series.length} hourly forecasts${peakHour ? ` · Peak ${fmtHour(peakHour.startTime)} UK` : ""}`}
            xLabel="Delivery hour · UK time"
            emptyMessage="No forecasts were available by this cutoff. Try another delivery day or cutoff hour."
            table={{
              head: ["Hour (UK)", "Forecast (MW)", "Actual (MW)", "Error (MW)", "Forecast age at cutoff (h)", "Actual coverage"],
              rows: series.map((p) => [
                fmtHour(p.startTime),
                Math.round(p.forecast),
                p.actual == null ? "–" : Math.round(p.actual),
                p.error == null ? "–" : Math.round(p.error),
                p.forecast_age_hours == null ? "–" : p.forecast_age_hours.toFixed(1),
                p.actual == null ? "Missing" : p.actual_complete == null ? "Unknown" : p.actual_complete ? "Complete" : "Incomplete",
              ]),
            }}
          >
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart accessibilityLayer data={chart} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} dataKey="t" interval="preserveStartEnd" minTickGap={32} />
                <YAxis {...yAxisProps} {...yScale(chart.flatMap((c) => [c.forecast, c.actual, c.band?.[1]]))} />
                <Tooltip {...tooltipProps()} />
                <Legend
                  {...legendProps()}
                  payload={legendEntries(hasActuals)?.filter((entry) => entry.id !== "band" || p90 != null)}
                />
                {p90 != null && <Area isAnimationActive={false} dataKey="band" legendType="none" name="Forecast ± P90 error" fill={SERIES_1} fillOpacity={0.14} stroke="none" activeDot={false} />}
                <Line isAnimationActive={false} dataKey="forecast" name="Forecast (at cutoff)" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
                {hasActuals && (
                  <Line isAnimationActive={false} dataKey="actual" name="Actual" stroke={SERIES_2} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
                )}
                {peakHour && <ReferenceDot x={fmtHour(peakHour.startTime)} y={peak!} r={4} fill={SERIES_1} stroke="var(--surface)" strokeWidth={2} label={{ value: "Peak", position: peakHour === series[series.length - 1] ? "insideBottomRight" : "insideBottomLeft", offset: 10, fill: "var(--text)", fontSize: 12 }} />}
              </ComposedChart>
            </ResponsiveContainer>
            {!hasActuals && <p className="actuals-note">Actuals are not yet available for this delivery day. The chart shows the forecast only; metered output will appear when returned by Elexon.</p>}
          </ChartCard>
          <div className="reading-note"><strong>Use the range as context.</strong> P90 is the nearest-rank 90th percentile of absolute hourly errors, not a guaranteed prediction interval. {bandMode === "prior" ? "Prior-days calibration uses earlier January delivery days with matched actuals and needs at least three such days. Actuals use currently available publications." : "Retrospective calibration uses the full month, including days after the selected delivery day."} Wind supply alone does not determine how much power to buy.</div>
          <p className="note scope-note">Coverage note: WINDFOR includes embedded wind; FUELHH measures transmission-level wind. Their scope difference can contribute to a positive forecast bias.</p>
        </div>
      )}
    </section>
  );
}
