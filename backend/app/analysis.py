from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc
HORIZON_BUCKETS = [(0, 6), (6, 12), (12, 18), (18, 24), (24, 30), (30, 36), (36, 42), (42, 48)]


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def cutoff_utc(day: date, hour: int) -> datetime:
    """Decision cutoff for delivery day `day`: `hour`:00 London time on the previous day, in UTC."""
    local = datetime.combine(day - timedelta(days=1), time(hour), tzinfo=LONDON)
    return local.astimezone(UTC)


def day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time(0), tzinfo=LONDON).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time(0), tzinfo=LONDON).astimezone(UTC)
    return start, end


def select_forecast(rows: list[dict], day: date, cutoff_hour: int) -> list[dict]:
    """Per target hour of delivery day, the latest forecast published at or before the cutoff."""
    cutoff = cutoff_utc(day, cutoff_hour)
    start, end = day_bounds_utc(day)
    best: dict[datetime, tuple[datetime, dict]] = {}
    for r in rows:
        target, published = parse_ts(r["startTime"]), parse_ts(r["publishTime"])
        if not (start <= target < end) or published > cutoff:
            continue
        if target not in best or published > best[target][0]:
            best[target] = (published, r)
    return [
        {"startTime": _iso(t), "publishTime": _iso(p), "forecast": r["generation"]}
        for t, (p, r) in sorted(best.items())
    ]


def hourly_actuals(rows: list[dict]) -> dict[datetime, float]:
    """Average the 30-minute actuals into hourly means keyed by hour start (UTC)."""
    buckets: dict[datetime, list[float]] = defaultdict(list)
    for r in rows:
        t = parse_ts(r["startTime"]).replace(minute=0, second=0, microsecond=0)
        buckets[t].append(r["generation"])
    return {t: sum(v) / len(v) for t, v in buckets.items()}


def metrics(pairs: list[tuple[float, float]]) -> dict:
    """pairs are (forecast, actual) in MW. error = forecast - actual."""
    n = len(pairs)
    if n == 0:
        return {"n": 0, "mae": None, "rmse": None, "mape": None, "bias": None, "p90_abs_error": None}
    errs = [f - a for f, a in pairs]
    abs_errs = sorted(abs(e) for e in errs)
    pct = [abs(f - a) / a * 100 for f, a in pairs if a]
    return {
        "n": n,
        "mae": sum(abs_errs) / n,
        "rmse": sqrt(sum(e * e for e in errs) / n),
        "mape": sum(pct) / len(pct) if pct else None,
        "bias": sum(errs) / n,
        "p90_abs_error": abs_errs[min(n - 1, int(0.9 * n))],
    }


def _days(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _horizon_bucket(hours: float) -> str | None:
    for lo, hi in HORIZON_BUCKETS:
        if lo <= hours < hi:
            return f"{lo}-{hi}h"
    return None


def accuracy(forecasts: list[dict], actuals: list[dict], start: date, end: date, cutoff_hour: int) -> dict:
    """Decision-time accuracy for delivery days start..end plus an all-lead-times horizon analysis."""
    act = hourly_actuals(actuals)
    series, daily = [], []
    for day in _days(start, end):
        day_pairs = []
        for f in select_forecast(forecasts, day, cutoff_hour):
            target = parse_ts(f["startTime"])
            actual = act.get(target)
            lead = (target - parse_ts(f["publishTime"])).total_seconds() / 3600
            series.append({
                "startTime": f["startTime"], "publishTime": f["publishTime"], "forecast": f["forecast"],
                "actual": actual, "error": None if actual is None else f["forecast"] - actual,
                "lead_hours": lead,
            })
            if actual is not None:
                day_pairs.append((f["forecast"], actual))
        daily.append({"day": day.isoformat(), **metrics(day_pairs)})

    paired = [(s["forecast"], s["actual"]) for s in series if s["actual"] is not None]

    by_hour: dict[int, list] = defaultdict(list)
    for s in series:
        if s["actual"] is not None:
            by_hour[parse_ts(s["startTime"]).astimezone(LONDON).hour].append((s["forecast"], s["actual"]))
    hourly = [{"hour": h, **metrics(by_hour[h])} for h in sorted(by_hour)]

    window_start, _ = day_bounds_utc(start)
    _, window_end = day_bounds_utc(end)
    by_bucket: dict[str, list] = defaultdict(list)
    for r in forecasts:
        target = parse_ts(r["startTime"])
        if not (window_start <= target < window_end) or target not in act:
            continue
        bucket = _horizon_bucket((target - parse_ts(r["publishTime"])).total_seconds() / 3600)
        if bucket:
            by_bucket[bucket].append((r["generation"], act[target]))
    horizon = [
        {"bucket": f"{lo}-{hi}h", **metrics(by_bucket[f"{lo}-{hi}h"])}
        for lo, hi in HORIZON_BUCKETS if f"{lo}-{hi}h" in by_bucket
    ]

    return {"overall": metrics(paired), "daily": daily, "hourly": hourly, "horizon": horizon, "series": series}
