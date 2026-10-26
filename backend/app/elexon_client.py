from datetime import datetime, timedelta, timezone

import httpx

from .cache import cached

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CHUNK_DAYS = 7
TTL_SECONDS = 3600


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def _stream(dataset: str, start: datetime, end: datetime, extra: dict | None = None) -> list[dict]:
    rows: list[dict] = []
    cursor = start
    with httpx.Client(timeout=60) as client:
        while cursor < end:
            nxt = min(cursor + timedelta(days=CHUNK_DAYS), end)
            params = {"publishDateTimeFrom": _iso(cursor), "publishDateTimeTo": _iso(nxt), **(extra or {})}
            resp = client.get(f"{BASE}/{dataset}/stream", params=params)
            resp.raise_for_status()
            rows.extend(resp.json())
            cursor = nxt
    return rows


def fetch_actuals(start: datetime, end: datetime) -> list[dict]:
    """FUELHH wind rows published in [start, end): startTime (UTC ISO) and generation (MW)."""
    key = f"actuals:{_iso(start)}:{_iso(end)}"
    return cached(key, TTL_SECONDS, lambda: _stream("FUELHH", start, end, {"fuelType": "WIND"}))


def fetch_forecasts(start: datetime, end: datetime) -> list[dict]:
    """WINDFOR rows published in [start, end): startTime, publishTime, generation (MW)."""
    key = f"forecasts:{_iso(start)}:{_iso(end)}"
    return cached(key, TTL_SECONDS, lambda: _stream("WINDFOR", start, end))
