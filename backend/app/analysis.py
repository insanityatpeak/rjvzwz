from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from math import ceil, sqrt
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
    """Latest publication at or before cutoff per target hour; last input row wins ties."""
    cutoff = cutoff_utc(day, cutoff_hour)
    start, end = day_bounds_utc(day)
    best: dict[datetime, tuple[datetime, dict]] = {}
    for r in rows:
        target, published = parse_ts(r["startTime"]), parse_ts(r["publishTime"])
        if not (start <= target < end) or published > cutoff:
            continue
        if target not in best or published >= best[target][0]:
            best[target] = (published, r)
    return [
        {"startTime": _iso(t), "publishTime": _iso(p), "forecast": r["generation"],
         "forecast_age_hours": (cutoff - p).total_seconds() / 3600}
        for t, (p, r) in sorted(best.items())
    ]


def hourly_actuals(rows: list[dict], *, with_coverage: bool = False):
    """Average distinct half-hours (last row wins); optionally return complete-hour keys too.

    Partial hours remain usable. Complete hours contain both the :00 and :30 intervals.
    The default return value remains the hourly means mapping.
    """
    distinct = {parse_ts(r["startTime"]): r["generation"] for r in rows}
    buckets: dict[datetime, list[float]] = defaultdict(list)
    for target, generation in distinct.items():
        t = target.replace(minute=0, second=0, microsecond=0)
        buckets[t].append(generation)
    means = {t: sum(v) / len(v) for t, v in buckets.items()}
    complete = {t for t in buckets if t in distinct and t + timedelta(minutes=30) in distinct}
    return (means, complete) if with_coverage else means


def metrics(pairs: list[tuple[float, float]]) -> dict:
    """Pairs are (forecast, actual) in MW; error = forecast - actual.

    P90 uses nearest rank: the ceil(0.9 * n)-th smallest absolute error.
    MAPE excludes zero actuals; WAPE is undefined when total actual generation is zero.
    Over/under means retain their signs; exact matches belong to neither group.
    """
    n = len(pairs)
    if n == 0:
        return {"n": 0, "mae": None, "rmse": None, "mape": None, "bias": None, "p90_abs_error": None,
                "mape_n": 0, "wape": None, "over_forecast_share": None,
                "mean_over_error": None, "mean_under_error": None}
    errs = [f - a for f, a in pairs]
    abs_errs = sorted(abs(e) for e in errs)
    pct = [abs(f - a) / a * 100 for f, a in pairs if a]
    total_actual = sum(a for _, a in pairs)
    over = [e for e in errs if e > 0]
    under = [e for e in errs if e < 0]
    return {
        "n": n,
        "mae": sum(abs_errs) / n,
        "rmse": sqrt(sum(e * e for e in errs) / n),
        "mape": sum(pct) / len(pct) if pct else None,
        "bias": sum(errs) / n,
        "p90_abs_error": abs_errs[ceil(0.9 * n) - 1],
        "mape_n": len(pct),
        "wape": sum(abs_errs) / total_actual * 100 if total_actual else None,
        "over_forecast_share": len(over) / n,
        "mean_over_error": sum(over) / len(over) if over else None,
        "mean_under_error": sum(under) / len(under) if under else None,
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
    act, complete = hourly_actuals(actuals, with_coverage=True)
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
                "forecast_age_hours": f["forecast_age_hours"],
                "actual_complete": target in complete,
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
    bucket_hours: dict[str, set] = defaultdict(set)
    horizon_excluded = 0
    for r in forecasts:
        target = parse_ts(r["startTime"])
        if not (window_start <= target < window_end):
            continue
        bucket = _horizon_bucket((target - parse_ts(r["publishTime"])).total_seconds() / 3600)
        if bucket is None:
            horizon_excluded += 1
        elif target in act:
            by_bucket[bucket].append((r["generation"], act[target]))
            bucket_hours[bucket].add(target)
    horizon = [
        {"bucket": f"{lo}-{hi}h", **metrics(by_bucket[f"{lo}-{hi}h"]),
         "distinct_hours": len(bucket_hours[f"{lo}-{hi}h"]),
         "sparse": len(bucket_hours[f"{lo}-{hi}h"]) < 24}
        for lo, hi in HORIZON_BUCKETS if f"{lo}-{hi}h" in by_bucket
    ]

    overall = {**metrics(paired), "coverage": {
        "matched_hours": len(paired),
        "missing_actual_hours": sum(s["actual"] is None for s in series),
        "incomplete_actual_hours": sum(s["actual"] is not None and not s["actual_complete"] for s in series),
    }}
    return {"overall": overall, "daily": daily, "hourly": hourly, "horizon": horizon,
            "horizon_excluded": horizon_excluded, "series": series}


def calibrate_band(forecasts: list[dict], actuals: list[dict], start: date, end: date,
                   cutoff_hour: int, minimum_days: int = 0, actuals_known_by: datetime | None = None) -> dict:
    """P90 of decision-time errors over delivery days start..end.

    With actuals_known_by, only actuals published by then are used, so the band is what a buyer
    could have computed at that moment. A delivery day counts only when every forecast hour of it
    has an actual, so a day that is still being delivered does not count towards the minimum.
    """
    if actuals_known_by is not None:
        actuals = [a for a in actuals
                   if "publishTime" not in a or parse_ts(a["publishTime"]) <= actuals_known_by]
    result = accuracy(forecasts, actuals, start, end, cutoff_hour)
    hours_per_day: dict[str, int] = defaultdict(int)
    for point in result["series"]:
        hours_per_day[parse_ts(point["startTime"]).astimezone(LONDON).date().isoformat()] += 1
    days = sum(d["n"] > 0 and d["n"] == hours_per_day[str(d["day"])] for d in result["daily"])
    p90 = result["overall"]["p90_abs_error"]
    note = None
    if days < minimum_days:
        p90 = None
        note = f"Prior-days calibration needs at least {minimum_days} fully matched delivery days; {days} available."
    elif p90 is None:
        note = "No matched forecast and actual hours are available for calibration."
    return {"p90_abs_error": p90, "calibration_days": days, "calibration_note": note}
