import json
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app import cache, elexon_client as e, main

api = TestClient(main.app)
START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = datetime(2026, 1, 9, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def mock_client(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(e.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.parametrize("dataset", ["WINDFOR", "FUELHH"])
def test_stream_deduplicates_chunk_overlap_last_row_wins(monkeypatch, dataset):
    calls = []
    row = {"startTime": "2026-01-08T12:00:00Z", "publishTime": "2026-01-07T08:00:00Z", "generation": 100}

    def handler(request):
        calls.append(dict(request.url.params))
        rows = [row] if len(calls) == 1 else [{**row, "generation": 200}]
        if dataset == "WINDFOR" and len(calls) == 2:
            rows.append({**row, "publishTime": "2026-01-07T09:00:00Z", "generation": 300})
        return httpx.Response(200, json=rows)

    mock_client(monkeypatch, handler)
    rows = e._stream(dataset, START, END)
    assert [r["generation"] for r in rows] == ([200, 300] if dataset == "WINDFOR" else [200])
    assert calls[0]["publishDateTimeTo"] == calls[1]["publishDateTimeFrom"]
    assert rows.skipped_records == 0


@pytest.mark.parametrize("dataset", ["WINDFOR", "FUELHH"])
def test_stream_skips_invalid_records_and_counts_them(monkeypatch, dataset):
    valid = {"startTime": "2026-01-01T12:00:00Z", "publishTime": "2025-12-31T08:00:00Z", "generation": 0}
    invalid = [None, [], {}, {**valid, "startTime": None}, {**valid, "startTime": "bad"},
               {**valid, "startTime": "2026-01-01T12:00:00"},
               {**valid, "generation": "100"}, {**valid, "generation": True},
               {**valid, "generation": float("nan")}, {**valid, "generation": float("inf")}]
    if dataset == "WINDFOR":
        invalid.extend([{**valid, "publishTime": None}, {**valid, "publishTime": "bad"}])
    else:
        valid.pop("publishTime")
    mock_client(monkeypatch, lambda request: httpx.Response(200, content=json.dumps([valid, *invalid])))
    rows = e._stream(dataset, START, datetime(2026, 1, 2, tzinfo=timezone.utc))
    assert rows == [valid]
    assert rows.skipped_records == len(invalid)


@pytest.mark.parametrize("body", ["upstream private details", '{"data": []}', 'null'])
def test_malformed_payload_raises_httpx_error_and_sanitised_502(monkeypatch, body):
    mock_client(monkeypatch, lambda request: httpx.Response(200, content=body))
    with pytest.raises(httpx.HTTPError):
        e._stream("WINDFOR", START, END)
    response = api.get("/api/accuracy")
    assert response.status_code == 502
    assert response.json() == {"detail": "Elexon API error: data could not be loaded."}
    assert body not in response.text


@pytest.mark.parametrize("now, expected", [
    (datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 1, 16, 6, tzinfo=timezone.utc)),
    (datetime(2026, 1, 16, 3, tzinfo=timezone.utc), datetime(2026, 1, 16, 3, tzinfo=timezone.utc)),
])
def test_actual_publication_window_extends_six_hours_and_caps_at_now(monkeypatch, now, expected):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now

    actual_windows = []
    monkeypatch.setattr(main, "datetime", Clock)
    monkeypatch.setattr(e, "fetch_forecasts", lambda start, end: [])
    monkeypatch.setattr(e, "fetch_actuals", lambda start, end: actual_windows.append((start, end)) or [])
    main._load(datetime(2026, 1, 15).date(), datetime(2026, 1, 15).date())
    assert actual_windows == [(datetime(2026, 1, 15, tzinfo=timezone.utc), expected)]


@pytest.mark.parametrize("path", ["/api/accuracy", "/api/forecast?day=2026-01-15"])
def test_skipped_record_counts_reach_response_meta_and_survive_cache(monkeypatch, path):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, json=[{"generation": 100}])

    mock_client(monkeypatch, handler)
    first = api.get(path)
    assert first.status_code == 200
    assert first.json()["meta"]["skipped_records"] == len(calls)
    count = len(calls)
    second = api.get(path)
    assert len(calls) == count
    assert second.json()["meta"] == first.json()["meta"]


def test_late_actual_is_included_without_next_day_leakage(monkeypatch):
    def handler(request):
        if "WINDFOR" in request.url.path:
            return httpx.Response(200, json=[
                {"startTime": "2026-01-10T23:00:00Z", "publishTime": "2026-01-09T08:00:00Z", "generation": 180},
                {"startTime": "2026-01-11T00:00:00Z", "publishTime": "2026-01-09T08:00:00Z", "generation": 999},
            ])
        assert request.url.params["publishDateTimeTo"] == "2026-01-11T06:00Z"
        return httpx.Response(200, json=[
            {"startTime": "2026-01-10T23:00:00Z", "generation": 100},
            {"startTime": "2026-01-10T23:30:00Z", "publishTime": "2026-01-11T01:00:00Z", "generation": 200},
            {"startTime": "2026-01-11T00:00:00Z", "generation": 1000},
        ])

    mock_client(monkeypatch, handler)
    response = api.get("/api/accuracy", params={"from": "2026-01-10", "to": "2026-01-10"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["series"]) == body["overall"]["n"] == 1
    assert body["series"][0]["actual"] == 150
    assert body["series"][0]["actual_complete"] is True
    assert body["overall"]["mae"] == 30
