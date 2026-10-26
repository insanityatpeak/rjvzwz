import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAccuracy, getForecast } from "../api";
import { fmtHour, fmtLondon, fmtMW } from "../format";
import { useAsync } from "../useAsync";
import { Kpi, Status } from "./Kpi";

interface Props {
  day: string;
  cutoffHour: number;
  rangeStart: string;
  rangeEnd: string;
  onDay: (d: string) => void;
}

export function DecisionView({ day, cutoffHour, rangeStart, rangeEnd, onDay }: Props) {
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
      <div className="controls">
        <label>
          Delivery day
          <input
            type="date"
            value={day}
            min={rangeStart}
            max={rangeEnd}
            onChange={(e) => e.target.value && onDay(e.target.value)}
          />
        </label>
        {fc.data && (
          <span className="note">
            Decision cutoff: {fmtLondon(fc.data.cutoff_utc)} (UK time). Showing the latest forecast published before then.
          </span>
        )}
      </div>
      <Status loading={fc.loading} error={fc.error} />
      {fc.data && (
        <>
          <div className="kpis">
            <Kpi label="Average forecast wind" value={fmtMW(avg)} hint="Day average, hourly" />
            <Kpi label="Peak forecast wind" value={fmtMW(peak)} />
            <Kpi label="Latest forecast used" value={latestPublish ? fmtLondon(latestPublish) : "–"} hint="Publish time (UK)" />
            <Kpi label="Typical error (P90)" value={fmtMW(p90)} hint="90% of hours within ± this, Jan 2026" />
          </div>
          <div className="card">
            <h3>Wind generation forecast vs actual, {day}</h3>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" interval={1} />
                <YAxis tickFormatter={(v) => `${v / 1000}k`} width={50} />
                <Tooltip formatter={(v) => (Array.isArray(v) ? `${fmtMW(Number(v[0]))} – ${fmtMW(Number(v[1]))}` : fmtMW(v as number))} />
                <Legend />
                <Area dataKey="band" name="Forecast ± P90 error" fill="#93c5fd" stroke="none" fillOpacity={0.35} />
                <Line dataKey="forecast" name="Forecast (at cutoff)" stroke="#2563eb" strokeWidth={2} dot={false} />
                {hasActuals && <Line dataKey="actual" name="Actual" stroke="#16a34a" strokeWidth={2} dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
            {!hasActuals && <p className="note">Actuals for this day are not published yet.</p>}
          </div>
        </>
      )}
    </section>
  );
}
