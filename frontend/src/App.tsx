import { useEffect, useState } from "react";
import { AccuracyView } from "./components/AccuracyView";
import { DecisionView } from "./components/DecisionView";

// Challenge scope: purchase decisions made in January 2026 (kept in sync with backend RANGE_START/RANGE_END).
const RANGE_START = "2026-01-01";
const RANGE_END = "2026-01-31";
const DEFAULT_CUTOFF = 9;

type Theme = "auto" | "light" | "dark";
const NEXT_THEME: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };

export default function App() {
  const [tab, setTab] = useState<"decision" | "accuracy">("decision");
  const [day, setDay] = useState("2026-01-15");
  const [from, setFrom] = useState(RANGE_START);
  const [to, setTo] = useState(RANGE_END);
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Wind Forecast Monitor</h1>
          <p>GB national wind generation: the day-ahead forecast available when you buy, and how accurate it has been. Source: Elexon BMRS.</p>
        </div>
        <button onClick={() => setTheme(NEXT_THEME[theme])} aria-label="Change colour theme">
          Theme: {theme}
        </button>
      </header>

      <nav>
        <button className={tab === "decision" ? "active" : ""} onClick={() => setTab("decision")}>
          Buying decision
        </button>
        <button className={tab === "accuracy" ? "active" : ""} onClick={() => setTab("accuracy")}>
          Forecast accuracy
        </button>
      </nav>

      <div className="filters">
        {tab === "decision" ? (
          <label>
            Delivery day
            <input type="date" value={day} min={RANGE_START} max={RANGE_END} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
        ) : (
          <>
            <label>
              From
              <input type="date" value={from} min={RANGE_START} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} min={from} max={RANGE_END} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Decision cutoff (UK hour, day before)
          <select value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      {tab === "decision" ? (
        <DecisionView day={day} cutoffHour={cutoff} rangeStart={RANGE_START} rangeEnd={RANGE_END} />
      ) : (
        <AccuracyView cutoffHour={cutoff} from={from} to={to} />
      )}
    </div>
  );
}
