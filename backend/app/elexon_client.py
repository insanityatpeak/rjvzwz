from datetime import datetime, timedelta, timezone
from math import isfinite

import httpx

from .cache import cached

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CHUNK_DAYS = 7
TTL_SECONDS = 3600


class Records(list):
    """A list of valid records carrying its skipped-record count through the cache."""

    def __init__(self, rows, skipped_records: int = 0):
        super().__init__(rows)
        self.skipped_records = skipped_records


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def _record_key(dataset: str, row) -> tuple | None:
    """Validate the fields used by analysis and return a UTC-normalised deduplication key."""
    if not isinstance(row, dict):
        return None
    generation = row.get("generation")
    if isinstance(generation, bool) or not isinstance(generation, (int, float)):
        return None
    fields = ("startTime", "publishTime") if dataset == "WINDFOR" else ("startTime",)
    try:
        if not isfinite(generation):
            return None
        timestamps = [datetime.fromisoformat(row[field].replace("Z", "+00:00")) for field in fields]
        if any(t.utcoffset() is None for t in timestamps):
            return None
        return tuple(t.astimezone(timezone.utc) for t in timestamps)
    except (KeyError, AttributeError, TypeError, ValueError, OverflowError):
        return None


def _stream(dataset: str, start: datetime, end: datetime, extra: dict | None = None) -> Records:
    """Read publication chunks, skip invalid records and keep the last row for each key."""
    rows: dict[tuple, dict] = {}
    skipped_records = 0
    cursor = start
    with httpx.Client(timeout=60) as client:
        while cursor < end:
            nxt = min(cursor + timedelta(days=CHUNK_DAYS), end)
            params = {"publishDateTimeFrom": _iso(cursor), "publishDateTimeTo": _iso(nxt), **(extra or {})}
            resp = client.get(f"{BASE}/{dataset}/stream", params=params)
            resp.raise_for_status()
            try:
                payload = resp.json()
            except (ValueError, UnicodeError) as exc:
                raise httpx.DecodingError("Invalid Elexon JSON response", request=resp.request) from exc
            if not isinstance(payload, list):
                raise httpx.DecodingError("Expected an Elexon record list", request=resp.request)
            for row in payload:
                key = _record_key(dataset, row)
                if key is None:
                    skipped_records += 1
                else:
                    rows[key] = row
            cursor = nxt
    return Records(rows.values(), skipped_records)


def fetch_actuals(start: datetime, end: datetime) -> list[dict]:
    """FUELHH wind rows published in [start, end): startTime (UTC ISO) and generation (MW)."""
    key = f"actuals:{_iso(start)}:{_iso(end)}"
    return cached(key, TTL_SECONDS, lambda: _stream("FUELHH", start, end, {"fuelType": "WIND"}))


def fetch_forecasts(start: datetime, end: datetime) -> list[dict]:
    """WINDFOR rows published in [start, end): startTime, publishTime, generation (MW)."""
    key = f"forecasts:{_iso(start)}:{_iso(end)}"
    return cached(key, TTL_SECONDS, lambda: _stream("WINDFOR", start, end))
