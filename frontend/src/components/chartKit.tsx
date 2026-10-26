import { useState, type ReactNode } from "react";
import { fmtMW } from "../format";

export const SERIES_1 = "var(--series-1)";
export const SERIES_2 = "var(--series-2)";

const axisTick = { fill: "var(--muted)", fontSize: 12 };

// Recharts only renders its own component types as direct children, so these are props to spread, not wrappers.
/** Recessive chrome shared by every chart: solid hairline grid, muted ticks, no tick marks. */
export const gridProps = { stroke: "var(--grid)", vertical: false } as const;
export const xAxisProps = { tick: axisTick, tickLine: false, axisLine: { stroke: "var(--baseline)" } } as const;
export const yAxisProps = {
  tick: axisTick,
  tickLine: false,
  axisLine: false,
  width: 48,
  tickFormatter: (v: number) => `${v / 1000}k`,
} as const;

/** Legend text stays in ink; the icon carries the series colour. */
export const legendProps = (iconType: "plainline" | "square" = "plainline") => ({
  iconType,
  wrapperStyle: { fontSize: 13 },
  formatter: (value: string) => <span style={{ color: "var(--text-2)" }}>{value}</span>,
});

interface TipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  stroke?: string;
  fill?: string;
  dataKey?: string | number;
}

/** Tooltip with a colour swatch per series; band ranges are shown as "low – high". */
export const tooltipProps = (unit: "MW" | "count" = "MW") => ({
  cursor: { stroke: "var(--baseline)", fill: "var(--grid)", fillOpacity: 0.4 },
  content: ({ active, payload, label }: { active?: boolean; payload?: unknown[]; label?: string | number }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="tip">
        <div className="tip-title">{label}</div>
        {(payload as TipEntry[]).map((p) => {
          const v = p.value;
          const text = Array.isArray(v)
            ? `${fmtMW(Number(v[0]))} – ${fmtMW(Number(v[1]))}`
            : unit === "MW"
              ? fmtMW(v as number | null)
              : String(v);
          return (
            <div className="tip-row" key={String(p.dataKey)}>
              <span className="swatch" style={{ background: p.color ?? p.stroke ?? p.fill }} />
              <span>{p.name}</span>
              <span className="tip-val">{text}</span>
            </div>
          );
        })}
      </div>
    );
  },
});

export interface TableData {
  head: string[];
  rows: (string | number)[][];
}

/** A card with a chart and a table-view twin, so no value is reachable only by hover. */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  table: TableData;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        <button onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
          {showTable ? "Chart" : "Table"}
        </button>
      </div>
      {showTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{table.head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
