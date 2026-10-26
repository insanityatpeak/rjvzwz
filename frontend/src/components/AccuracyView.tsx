import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAccuracy } from "../api";
import { errorHistogram, fmtHour, fmtMW, fmtPct, toCsv } from "../format";
import { useAsync } from "../useAsync";
import { ChartCard, SERIES_1, SERIES_2, gridProps, legendProps, tooltipProps, xAxisProps, yAxisProps } from "./chartKit";
import { Kpi, Status } from "./Kpi";

interface Props {
  cutoffHour: number;
  from: string;
  to: string;
}

const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const r = (v: number | null) => (v == null ? "–" : Math.round(v));

export function AccuracyView({ cutoffHour, from, to }: Props) {
  const { data, loading, error } = useAsync(() => getAccuracy(from, to, cutoffHour), [from, to, cutoffHour]);

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
    <section>
      <Status loading={loading} error={error} hasData={!!data} />
      {data && (
        <div className={loading ? "stale" : ""}>
          <div className="kpis">
            <Kpi label="MAE" value={fmtMW(data.overall.mae)} hint="Mean absolute error" />
            <Kpi label="RMSE" value={fmtMW(data.overall.rmse)} hint="Penalises large misses" />
            <Kpi label="MAPE" value={fmtPct(data.overall.mape)} hint="Error as % of actual" />
            <Kpi label="Bias" value={fmtMW(data.overall.bias)} hint="Forecast − actual (+ = over-forecast)" />
          </div>

          <ChartCard
            title="Forecast at decision time vs actual"
            subtitle={`${data.overall.n.toLocaleString("en-GB")} hourly points; times are UK local`}
            table={{
              head: ["Hour (UK)", "Forecast (MW)", "Actual (MW)"],
              rows: series.map((p) => [p.t, Math.round(p.forecast), r(p.actual)]),
            }}
          >
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} dataKey="t" minTickGap={70} />
                <YAxis {...yAxisProps} />
                <Tooltip {...tooltipProps()} />
                <Legend {...legendProps()} />
                <Line dataKey="forecast" name="Forecast" stroke={SERIES_1} dot={false} strokeWidth={2} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
                <Line dataKey="actual" name="Actual" stroke={SERIES_2} dot={false} strokeWidth={2} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid">
            <ChartCard
              title="Mean absolute error by delivery day"
              table={{
                head: ["Day", "MAE (MW)", "Bias (MW)", "Hours"],
                rows: data.daily.map((d) => [d.day, r(d.mae), r(d.bias), d.n]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.daily.map((d) => ({ ...d, label: d.day.slice(8) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="label" interval={1} />
                  <YAxis {...yAxisProps} />
                  <Tooltip {...tooltipProps()} />
                  <Bar dataKey="mae" name="MAE" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Error by forecast lead time"
              subtitle="All published forecasts, hours between publish and target"
              table={{
                head: ["Lead time", "MAE (MW)", "RMSE (MW)", "Samples"],
                rows: data.horizon.map((h) => [h.bucket, r(h.mae), r(h.rmse), h.n]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.horizon} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="bucket" />
                  <YAxis {...yAxisProps} />
                  <Tooltip {...tooltipProps()} />
                  <Legend {...legendProps("square")} />
                  <Bar dataKey="mae" name="MAE" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={18} />
                  <Bar dataKey="rmse" name="RMSE" fill={SERIES_2} radius={BAR_RADIUS} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Error distribution"
              subtitle="Hours by forecast − actual, 1,000 MW bins (k = thousand MW)"
              table={{ head: ["Bin start (MW)", "Hours"], rows: hist.map((b) => [b.bin, b.count]) }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="label" />
                  <YAxis {...yAxisProps} tickFormatter={(v) => String(v)} width={36} />
                  <Tooltip {...tooltipProps("count")} />
                  <Bar dataKey="count" name="Hours" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Mean absolute error by hour of day"
              subtitle="UK local time"
              table={{
                head: ["Hour", "MAE (MW)", "Bias (MW)"],
                rows: data.hourly.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, r(h.mae), r(h.bias)]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} dataKey="hour" />
                  <YAxis {...yAxisProps} />
                  <Tooltip {...tooltipProps()} />
                  <Bar dataKey="mae" name="MAE" fill={SERIES_1} radius={BAR_RADIUS} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <p className="note">
            <button onClick={download}>Export CSV</button>
          </p>
        </div>
      )}
    </section>
  );
}
