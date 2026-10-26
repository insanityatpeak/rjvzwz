export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

/** Banner for the first load or an error. On refetch the previous render stays (dimmed by the caller). */
export function Status({ loading, error, hasData }: { loading: boolean; error: string | null; hasData: boolean }) {
  if (error) return <div className="banner error" role="alert">Could not load data: {error}</div>;
  if (loading && !hasData) return <div className="banner" role="status">Loading from Elexon… the first request can take several seconds.</div>;
  return null;
}
