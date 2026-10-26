import { useState } from "react";
import { AccuracyView } from "./components/AccuracyView";
import { DecisionView } from "./components/DecisionView";

// Challenge scope: purchase decisions made in January 2026 (kept in sync with backend RANGE_START/RANGE_END).
const RANGE_START = "2026-01-01";
const RANGE_END = "2026-01-31";
const DEFAULT_CUTOFF = 9;

export default function App() {
  const [tab, setTab] = useState<"decision" | "accuracy">("decision");
  const [day, setDay] = useState("2026-01-15");
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Wind Forecast Monitor</h1>
          <p>GB national wind generation: day-ahead forecasts and their accuracy. Source: Elexon BMRS (WINDFOR, FUELHH).</p>
        </div>
        <label className="cutoff">
          Decision cutoff (UK hour, day before)
          <select value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </header>
      <nav>
        <button className={tab === "decision" ? "active" : ""} onClick={() => setTab("decision")}>
          Buying decision
        </button>
        <button className={tab === "accuracy" ? "active" : ""} onClick={() => setTab("accuracy")}>
          Forecast accuracy
        </button>
      </nav>
      {tab === "decision" ? (
        <DecisionView day={day} cutoffHour={cutoff} rangeStart={RANGE_START} rangeEnd={RANGE_END} onDay={setDay} />
      ) : (
        <AccuracyView cutoffHour={cutoff} rangeStart={RANGE_START} rangeEnd={RANGE_END} />
      )}
    </div>
  );
}
