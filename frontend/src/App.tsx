import { useEffect, useState } from "react";
import { AccuracyView } from "./components/AccuracyView";
import { DecisionView } from "./components/DecisionView";
import type { Calibration } from "./types";

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
  const [calibration, setCalibration] = useState<Calibration>("retrospective");
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <a className="skip-link" href="#dashboard">Skip to dashboard</a>
      <header className="app-header">
        <div className="brand">
          <svg className="brand-mark" width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <path d="M5 12h19a4 4 0 1 0-4-4M5 18h26M5 24h14a4 4 0 1 1-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div>
            <h1>Wind Forecast Monitor</h1>
            <p>GB wind generation · Day-ahead buying</p>
          </div>
        </div>
        <button className="theme-button" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={`Colour theme: ${theme}. Switch to ${NEXT_THEME[theme]}`}>
          Theme: {theme}
        </button>
      </header>

      <nav aria-label="Dashboard views">
        <button aria-pressed={tab === "decision"} className={tab === "decision" ? "active" : ""} onClick={() => setTab("decision")}>
          Buying decision
        </button>
        <button aria-pressed={tab === "accuracy"} className={tab === "accuracy" ? "active" : ""} onClick={() => setTab("accuracy")}>
          Forecast accuracy
        </button>
      </nav>

      <main id="dashboard">
        <div className="view-heading">
          <div>
            <h2>{tab === "decision" ? "Your day-ahead wind outlook" : "How reliable was the forecast?"}</h2>
            <p>{tab === "decision" ? "Expected wind supply at your buying cutoff, with historical error for context." : "Compare the forecast available when buying with metered wind generation."}</p>
          </div>
          <span className="scope-label">January 2026 archive</span>
        </div>
        <div className="filters">
          {tab === "decision" ? (
            <label>
              Delivery day
              <input type="date" value={day} min={RANGE_START} max={RANGE_END} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </label>
          ) : (
            <>
              <label>
                Delivery from
                <input type="date" value={from} min={RANGE_START} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </label>
              <label>
                Delivery to
                <input type="date" value={to} min={from} max={RANGE_END} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </label>
            </>
          )}
          <label>
            Decision cutoff · UK time on D−1
            <select value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          {tab === "decision" && (
            <label>
              Error-band calibration
              <select value={calibration} onChange={(e) => setCalibration(e.target.value as Calibration)}>
                <option value="retrospective">Retrospective</option>
                <option value="prior">Prior days only</option>
              </select>
            </label>
          )}
          <p className="filter-note">D−1 is the day before delivery.<br />Only forecasts published by this time are selected.</p>
        </div>

        {tab === "decision" ? (
          <DecisionView day={day} cutoffHour={cutoff} calibration={calibration} />
        ) : (
          <AccuracyView cutoffHour={cutoff} from={from} to={to} />
        )}
      </main>
      <footer className="app-footer"><span>Source: Elexon BMRS · WINDFOR / FUELHH</span><span>All times UK local · Generation in MW</span></footer>
    </div>
  );
}
