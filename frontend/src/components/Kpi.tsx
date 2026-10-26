export function Kpi({ label, value, hint, prominent = false }: { label: string; value: string; hint?: string; prominent?: boolean }) {
  return (
    <div className={`kpi${prominent ? " kpi-prominent" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

/** Banner for the first load or an error. On refetch the previous render stays (dimmed by the caller). */
export function Status({ loading, error, hasData, onRetry }: { loading: boolean; error: string | null; hasData: boolean; onRetry: () => void }) {
  if (error) return (
    <div className="banner error" role="alert">
      <div>
        <strong>Unable to load Elexon data</strong>
        <p>{error}</p>
        <p>Try again to request the selected dates and cutoff.</p>
      </div>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
  if (loading && !hasData) return (
    <div className="loading-state" role="status">
      <p>Loading Elexon data… <span>The first request can take several seconds.</span></p>
      <div className="skeleton-kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((n) => <div className="skeleton" key={n} />)}
      </div>
      <div className="skeleton skeleton-chart" aria-hidden="true" />
    </div>
  );
  if (loading) return <p className="refresh-status" role="status">Updating selection… Previous results are shown below.</p>;
  return null;
}
