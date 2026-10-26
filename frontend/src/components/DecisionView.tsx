import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAccuracy, getForecast } from "../api";
import { fmtHour, fmtLondon, fmtMW } from "../format";
import { useAsync } from "../useAsync";
import { ChartCard, SERIES_1, SERIES_2, gridProps, legendProps, tooltipProps, xAxisProps, yAxisProps } from "./chartKit";
import { Kpi, Status } from "./Kpi";

interface Props {
  day: string;
  cutoffHour: number;
  rangeStart: string;
  rangeEnd: string;
}

export function DecisionView({ day, cutoffHour, rangeStart, rangeEnd }: Props) {
  const fc = useAsync(() => getForecast(day, cutoffHour), [day, cutoffHour]);
  const acc = useAsync(() => getAccuracy(rangeStart, rangeEnd, cutoffHour), [rangeStart, rangeEnd, cutoffHour]);

  const p90 = acc.data?.overall.p90_abs_error ?? null;
  const series = fc.data?.series ?? [];
  const chart = series.map((p) => ({
    t: fmtHour(p.startTime),
    forecast: p.forecast,
    actual: p.actual,
    band: p90 == null ? undefined : [Math.max(0, p.forecast - p90), p.forecast + p90],
  }));
  const avg = series.length ? series.reduce((s, p) => s + p.forecast, 0) / series.length : null;
  const peak = series.length ? Math.max(...series.map((p) => p.forecast)) : null;
  const latestPublish = series.length ? series.map((p) => p.publishTime).sort().pop()! : null;
  const hasActuals = series.some((p) => p.actual != null);

  return (
    <section>
      <Status loading={fc.loading} error={fc.error} hasData={!!fc.data} />
      {fc.data && (
        <div className={fc.loading ? "stale" : ""}>
          <div className="kpis">
            <Kpi label="Average forecast wind" value={fmtMW(avg)} hint="Delivery-day mean, hourly" />
            <Kpi label="Peak forecast wind" value={fmtMW(peak)} hint="Highest hour of the day" />
            <Kpi label="Forecast as of" value={latestPublish ? fmtLondon(latestPublish) : "–"} hint={`Latest publish before ${fmtLondon(fc.data.cutoff_utc)} cutoff (UK)`} />
            <Kpi label="Typical error (P90)" value={fmtMW(p90)} hint="90% of hours within ± this, Jan 2026" />
          </div>
          <ChartCard
            title={`Wind generation, ${day}`}
            subtitle="Forecast available at the decision cutoff; the shaded band is the typical error range (± P90)"
            table={{
              head: ["Hour (UK)", "Forecast (MW)", "Actual (MW)", "Error (MW)"],
              rows: series.map((p) => [
                fmtHour(p.startTime),
                Math.round(p.forecast),
                p.actual == null ? "–" : Math.round(p.actual),
                p.error == null ? "–" : Math.round(p.error),
              ]),
            }}
          >
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} dataKey="t" interval={1} />
                <YAxis {...yAxisProps} />
                <Tooltip {...tooltipProps()} />
                <Legend {...legendProps()} />
                <Area dataKey="band" legendType="none" name="Forecast ± P90 error" fill={SERIES_1} fillOpacity={0.14} stroke="none" activeDot={false} />
                <Line dataKey="forecast" name="Forecast (at cutoff)" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
                {hasActuals && (
                  <Line dataKey="actual" name="Actual" stroke={SERIES_2} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {!hasActuals && <p className="note">Actuals for this day are not published yet.</p>}
          </ChartCard>
        </div>
      )}
    </section>
  );
}
