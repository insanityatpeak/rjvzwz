import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAccuracy } from "../api";
import { errorHistogram, fmtHour, fmtMW, fmtPct, toCsv } from "../format";
import { useAsync } from "../useAsync";
import { Kpi, Status } from "./Kpi";

interface Props {
  cutoffHour: number;
  rangeStart: string;
  rangeEnd: string;
}

const kTick = (v: number) => `${v / 1000}k`;
const mw = (v: unknown) => fmtMW(v as number);

export function AccuracyView({ cutoffHour, rangeStart, rangeEnd }: Props) {
  const [from, setFrom] = useState(rangeStart);
  const [to, setTo] = useState(rangeEnd);
  const { data, loading, error } = useAsync(() => getAccuracy(from, to, cutoffHour), [from, to, cutoffHour]);

  const series = (data?.series ?? []).map((p) => ({
    t: `${p.startTime.slice(5, 10)} ${fmtHour(p.startTime)}`,
    forecast: p.forecast,
    actual: p.actual,
  }));

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
      <div className="controls">
        <label>
          From
          <input type="date" value={from} min={rangeStart} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} min={from} max={rangeEnd} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <button onClick={download} disabled={!data}>
          Export CSV
        </button>
      </div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <div className="kpis">
            <Kpi label="MAE" value={fmtMW(data.overall.mae)} hint="Mean absolute error" />
            <Kpi label="RMSE" value={fmtMW(data.overall.rmse)} hint="Penalises large misses" />
            <Kpi label="MAPE" value={fmtPct(data.overall.mape)} hint="Error as % of actual" />
            <Kpi label="Bias" value={fmtMW(data.overall.bias)} hint="Forecast − actual (+ = over-forecast)" />
          </div>
          <div className="card">
            <h3>Forecast at decision time vs actual</h3>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" minTickGap={60} />
                <YAxis tickFormatter={kTick} width={50} />
                <Tooltip formatter={mw} />
                <Legend />
                <Line dataKey="forecast" name="Forecast" stroke="#2563eb" dot={false} strokeWidth={1.5} />
                <Line dataKey="actual" name="Actual" stroke="#16a34a" dot={false} strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid">
            <div className="card">
              <h3>Mean absolute error by delivery day</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.daily.map((d) => ({ ...d, label: d.day.slice(8) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={kTick} width={50} />
                  <Tooltip formatter={mw} />
                  <Bar dataKey="mae" name="MAE" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3>Error by forecast lead time (all publishes)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.horizon}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis tickFormatter={kTick} width={50} />
                  <Tooltip formatter={mw} />
                  <Legend />
                  <Bar dataKey="mae" name="MAE" fill="#2563eb" />
                  <Bar dataKey="rmse" name="RMSE" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3>Error distribution (forecast − actual, MW)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={errorHistogram(data.series)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis width={40} />
                  <Tooltip />
                  <Bar dataKey="count" name="Hours" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3>MAE by hour of day (UK)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.hourly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis tickFormatter={kTick} width={50} />
                  <Tooltip formatter={mw} />
                  <Bar dataKey="mae" name="MAE" fill="#0d9488" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
