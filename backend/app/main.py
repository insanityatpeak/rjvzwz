from datetime import date, datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import analysis, elexon_client

# The challenge scope: purchase decisions made in January 2026 (delivery days 1 Jan - 31 Jan).
RANGE_START = date(2026, 1, 1)
RANGE_END = date(2026, 1, 31)
DEFAULT_CUTOFF_HOUR = 9

app = FastAPI(title="Wind Forecast Monitor")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def _check_range(start: date, end: date) -> None:
    if start > end:
        raise HTTPException(400, "from must not be after to")
    if start < RANGE_START or end > RANGE_END:
        raise HTTPException(400, f"dates must be within {RANGE_START} and {RANGE_END}")


def _load(start: date, end: date):
    """Fetch forecast publications and allow six hours for late actual publications, capped at now."""
    day_start, _ = analysis.day_bounds_utc(start)
    _, day_end = analysis.day_bounds_utc(end)
    pub_from = day_start - timedelta(days=3)
    pub_to = day_end
    now = datetime.now(timezone.utc)
    try:
        forecasts = elexon_client.fetch_forecasts(pub_from, pub_to)
        actuals = elexon_client.fetch_actuals(day_start, min(day_end + timedelta(hours=6), now))
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Elexon API error: data could not be loaded.") from exc
    return forecasts, actuals


def _response_meta(forecasts: list[dict], actuals: list[dict]) -> dict:
    """Counts cover the fetched publication windows, including the actuals grace period."""
    return {"skipped_records": getattr(forecasts, "skipped_records", 0) + getattr(actuals, "skipped_records", 0)}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    return {"range_start": RANGE_START, "range_end": RANGE_END, "default_cutoff_hour": DEFAULT_CUTOFF_HOUR}


@app.get("/api/accuracy")
def accuracy(
    from_: date = Query(RANGE_START, alias="from"),
    to: date = RANGE_END,
    cutoff_hour: int = Query(DEFAULT_CUTOFF_HOUR, ge=0, le=23),
):
    """Accuracy of the decision-time forecast for delivery days from..to, with overall/daily/hourly/horizon stats."""
    _check_range(from_, to)
    forecasts, actuals = _load(from_, to)
    result = analysis.accuracy(forecasts, actuals, from_, to, cutoff_hour)
    return {"cutoff_hour": cutoff_hour, "from": from_, "to": to, **result,
            "meta": _response_meta(forecasts, actuals)}


@app.get("/api/forecast")
def forecast(day: date, cutoff_hour: int = Query(DEFAULT_CUTOFF_HOUR, ge=0, le=23),
             calibration: Literal["retrospective", "prior"] = "retrospective"):
    """The latest forecast available at the decision cutoff for one delivery day, with actuals if already known."""
    _check_range(day, day)
    calibration_end = day - timedelta(days=1) if calibration == "prior" else RANGE_END
    forecasts, actuals = _load(RANGE_START, max(day, calibration_end))
    result = analysis.accuracy(forecasts, actuals, day, day, cutoff_hour)
    band = analysis.calibrate_band(forecasts, actuals, RANGE_START, calibration_end, cutoff_hour,
                                   minimum_days=3 if calibration == "prior" else 0,
                                   actuals_known_by=analysis.cutoff_utc(day, cutoff_hour) if calibration == "prior" else None)
    return {
        "day": day,
        "cutoff_hour": cutoff_hour,
        "cutoff_utc": analysis.cutoff_utc(day, cutoff_hour).isoformat(),
        "series": result["series"],
        "calibration": calibration,
        "meta": _response_meta(forecasts, actuals),
        **band,
    }
