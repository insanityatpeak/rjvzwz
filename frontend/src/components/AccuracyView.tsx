import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAccuracy } from "../api";
import { errorHistogram, fmtHour, fmtMW, fmtPct, toCsv } from "../format";
import { useAsync } from "../useAsync";
import { ChartCard, SERIES_1, SERIES_2, gridProps, legendProps, tooltipProps, xAxisProps, yAxisProps, yScale } from "./chartKit";
import { Kpi, Status } from "./Kpi";

interface Props {
  cutoffHour: number;
  from: string;
  to: string;
}

const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const r = (v: number | null) => (v == null ? "–" : Math.round(v));

export function AccuracyView({ cutoffHour, from, to }: Props) {
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useAsync(() => getAccuracy(from, to, cutoffHour), [from, to, cutoffHour, retry]);

  const series = (data?.series ?? []).map((p) => ({
    t: `${p.startTime.slice(5, 10)} ${fmtHour(p.startTime)}`,
    forecast: p.forecast,
    actual: p.actual,
  }));
  const hist = data ? errorHistogram(data.series) : [];

  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([toCsv(data.series)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `wind-forecast-accuracy-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Forecast accuracy results" aria-busy={loading}>
      <Status loading={loading} error={error} hasData={!!data} onRetry={() => setRetry((n) => n + 1)} />
      {data && (
        <div className={loading ? "stale" : ""}>
          <div className="result-context"><h3>Decision-time performance</h3><span>{data.overall.n.toLocaleString("en-GB")} matched hours · {String(data.cutoff_hour).padStart(2, "0")}:00 UK cutoff on D−1</span></div>
          <div className="kpis accuracy-kpis">
            <Kpi label="MAE · Average miss" value={fmtMW(data.overall.mae)} hint="Mean absolute error · ignores direction" />
            <Kpi label="RMSE · Larger misses" value={fmtMW(data.overall.rmse)} hint="Root mean square error · gives big misses more weight" />
            <Kpi label="MAPE · Relative miss" value={fmtPct(data.overall.mape)} hint={`Zero actuals excluded${data.overall.mape_n == null ? "" : ` · ${data.overall.mape_n} hours used`}`} />
            <Kpi label="Bias · Direction" value={fmtMW(data.overall.bias)} hint="Mean forecast − actual · positive means over-forecast" />
          </div>
          <p className="note coverage-line">
            <strong>Data coverage:</strong> {data.overall.coverage?.matched_hours ?? data.overall.n} matched hours · {data.overall.coverage?.missing_actual_hours ?? "–"} missing actuals · {data.overall.coverage?.incomplete_actual_hours ?? "–"} incomplete hours · {data.meta?.skipped_records ?? "–"} skipped records across fetched publication windows. Incomplete hours remain in the metrics.
          </p>
          <div className="kpis secondary-kpis">
            <Kpi label="WAPE · Total relative miss" value={fmtPct(data.overall.wape)} hint="Total absolute error ÷ total actual output" />
            <Kpi label="Over-forecast hours" value={fmtPct(data.overall.over_forecast_share == null ? null : data.overall.over_forecast_share * 100)} hint="Share of matched hours with forecast above actual" />
            <Kpi label="Mean over-forecast error" value={fmtMW(data.overall.mean_over_error)} hint="Average positive error · over-forecast hours only" />
            <Kpi label="Mean under-forecast error" value={fmtMW(data.overall.mean_under_error)} hint="Average negative error · under-forecast hours only" />
          </div>
          <details className="metric-guide"><summary>How to read these measures</summary><p>MAE is the average size of the hourly miss in MW. RMSE gives more weight to large misses. Lower values are better for both. MAPE expresses each miss as a percentage of actual output and can become large when actual generation is low; hours with zero actuals are skipped. Bias retains direction: positive means forecast wind was higher than metered output, negative means lower.</p><p>WINDFOR includes embedded wind, while FUELHH measures transmission-level wind. That scope difference contributes to bias; these measures do not isolate forecast skill.</p></details>

          <ChartCard
            title="The wind expected at buying time, and what arrived"
            subtitle="Blue: forecast selected at the D−1 cutoff · Orange: metered actual · Gaps mean unavailable actuals"
            xLabel="Delivery date and hour · UK time"
            table={{
              head: ["Hour (UK)", "Forecast (MW)", "Actual (MW)"],
              rows: series.map((p) => [p.t, Math.round(p.forecast), r(p.actual)]),
            }}
          >
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart accessibilityLayer data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} dataKey="t" minTickGap={70} />
                <YAxis {...yAxisProps} {...yScale(series.flatMap((p) => [p.forecast, p.actual]))} />
                <Tooltip {...tooltipProps()} />
                <Legend {...legendProps()} />
                <Line isAnimationActive={false} dataKey="forecast" name="Forecast" stroke={SERIES_1} dot={false} strokeWidth={2} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
                <Line isAnimationActive={false} dataKey="actual" name="Actual" stroke={SERIES_2} dot={false} strokeWidth={2} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
          {!data.series.some((p) => p.actual != null) && data.series.length > 0 && <p className="banner">Actuals are not yet available for this selection. Forecasts are shown; accuracy measures need matched actuals.</p>}

          <div className="section-heading"><h3>Understand the misses</h3><p>Compare error across delivery days, forecast lead times and hours.</p></div>
          <div className="grid">
            <ChartCard
              title="Mean absolute error by delivery day"
              subtitle="Average miss in MW · Lower is better"
              xLabel="Delivery day · January 2026"
              table={{
                head: ["Day", "MAE (MW)", "Bias (MW)", "Hours"],
                rows: data.daily.map((d) => [d.day, r(d.mae), r(d.bias), d.n]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart accessibilityLayer data={data.daily.map((d) => ({ ...d, label: d.day.slice(8) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="label" interval={1} />
                  <YAxis {...yAxisProps} {...yScale(data.daily.map((d) => d.mae))} />
                  <Tooltip {...tooltipProps()} />
                  <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Error by forecast lead time"
              subtitle={`All publications · Sparse = fewer than 24 distinct hours · ${data.horizon_excluded ?? "–"} publications outside 0–48h excluded`}
              xLabel="Hours from publication to delivery · Upper bound excluded"
              table={{
                head: ["Lead time", "MAE (MW)", "RMSE (MW)", "Publications", "Distinct hours", "Coverage"],
                rows: data.horizon.map((h) => [h.bucket, r(h.mae), r(h.rmse), h.n, h.distinct_hours ?? "–", h.sparse == null ? "Unknown" : h.sparse ? "Sparse" : "24+ hours"]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart accessibilityLayer data={data.horizon} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="bucket" />
                  <YAxis {...yAxisProps} {...yScale(data.horizon.flatMap((h) => [h.mae, h.rmse]))} />
                  <Tooltip {...tooltipProps()} />
                  <Legend {...legendProps("square")} />
                  <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={18} />
                  <Bar isAnimationActive={false} dataKey="rmse" name="RMSE" fill={SERIES_2} radius={BAR_RADIUS} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Error distribution"
              subtitle="Negative: under-forecast · Positive: over-forecast · 1,000 MW bins"
              unit="Hours"
              xLabel="Forecast − actual · k = 1,000 MW · Labels are bin starts"
              table={{ head: ["Bin start (MW)", "Hours"], rows: hist.map((b) => [b.bin, b.count]) }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart accessibilityLayer data={hist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="label" />
                  <YAxis {...yAxisProps} {...yScale(hist.map((b) => b.count))} tickFormatter={(v) => String(v)} width={36} />
                  <Tooltip {...tooltipProps("count")} />
                  <ReferenceLine x="0k" stroke="var(--baseline)" />
                  <Bar isAnimationActive={false} dataKey="count" name="Hours" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Mean absolute error by hour of day"
              subtitle="Average miss at each delivery hour · Lower is better"
              xLabel="Delivery hour · UK time"
              table={{
                head: ["Hour", "MAE (MW)", "Bias (MW)"],
                rows: data.hourly.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, r(h.mae), r(h.bias)]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart accessibilityLayer data={data.hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`} minTickGap={24} />
                  <YAxis {...yAxisProps} {...yScale(data.hourly.map((h) => h.mae))} />
                  <Tooltip {...tooltipProps()} />
                  <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="export-row"><p className="note">Take the hourly forecast, actual and signed error into your own analysis.</p><button onClick={download} disabled={loading}>Export CSV</button></div>
        </div>
      )}
    </section>
  );
}
