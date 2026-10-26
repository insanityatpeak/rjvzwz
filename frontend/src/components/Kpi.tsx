export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <div className="banner error">Could not load data: {error}</div>;
  if (loading) return <div className="banner">Loading from Elexon… the first request can take several seconds.</div>;
  return null;
}
