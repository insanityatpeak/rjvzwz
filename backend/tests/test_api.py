import httpx
import pytest
from fastapi.testclient import TestClient

from app import elexon_client
from app.main import app

client = TestClient(app)

FORECASTS = [
    {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-09T08:30:00Z", "generation": 120},
]
ACTUALS = [
    {"startTime": "2026-01-10T12:00:00Z", "generation": 100},
    {"startTime": "2026-01-10T12:30:00Z", "generation": 100},
]


@pytest.fixture(autouse=True)
def fake_elexon(monkeypatch):
    monkeypatch.setattr(elexon_client, "fetch_forecasts", lambda s, e: FORECASTS)
    monkeypatch.setattr(elexon_client, "fetch_actuals", lambda s, e: ACTUALS)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta():
    body = client.get("/api/meta").json()
    assert body["range_start"] == "2026-01-01"
    assert body["default_cutoff_hour"] == 9


def test_forecast_for_day():
    body = client.get("/api/forecast", params={"day": "2026-01-10"}).json()
    assert body["cutoff_utc"].startswith("2026-01-09T09:00")
    assert body["series"][0]["forecast"] == 120
    assert body["series"][0]["actual"] == 100


def test_accuracy_overall():
    body = client.get("/api/accuracy", params={"from": "2026-01-10", "to": "2026-01-10"}).json()
    assert body["overall"]["mae"] == 20
    assert len(body["daily"]) == 1


def test_rejects_out_of_scope_dates():
    assert client.get("/api/forecast", params={"day": "2026-02-01"}).status_code == 400
    assert client.get("/api/accuracy", params={"from": "2026-01-10", "to": "2026-01-05"}).status_code == 400


def test_upstream_failure_maps_to_502(monkeypatch):
    def boom(s, e):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(elexon_client, "fetch_forecasts", boom)
    assert client.get("/api/forecast", params={"day": "2026-01-10"}).status_code == 502


def test_additive_accuracy_fields_and_existing_metric_meanings():
    body = client.get("/api/accuracy", params={"from": "2026-01-10", "to": "2026-01-10"}).json()
    overall = body["overall"]
    assert {k: overall[k] for k in ("n", "mae", "rmse", "mape", "bias", "p90_abs_error")} == {
        "n": 1, "mae": 20, "rmse": 20, "mape": 20, "bias": 20, "p90_abs_error": 20,
    }
    assert overall["coverage"] == {"matched_hours": 1, "missing_actual_hours": 0, "incomplete_actual_hours": 0}
    assert (overall["mape_n"], overall["wape"], overall["over_forecast_share"],
            overall["mean_over_error"], overall["mean_under_error"]) == (1, 20, 1, 20, None)
    assert body["series"][0]["forecast_age_hours"] == 0.5
    assert body["series"][0]["actual_complete"] is True
    assert body["horizon"][0]["distinct_hours"] == 1
    assert body["horizon"][0]["sparse"] is True
    assert body["horizon_excluded"] == 0
    assert body["meta"] == {"skipped_records": 0}


def test_additive_forecast_fields():
    body = client.get("/api/forecast", params={"day": "2026-01-10"}).json()
    assert body["series"] == [{
        "startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-09T08:30:00Z",
        "forecast": 120, "actual": 100, "error": 20, "lead_hours": 27.5,
        "forecast_age_hours": 0.5, "actual_complete": True,
    }]
    assert body["p90_abs_error"] == 20
    assert body["calibration_days"] == 1
    assert body["calibration_note"] is None
    assert body["meta"] == {"skipped_records": 0}


@pytest.mark.parametrize("hour", [-1, 24])
def test_cutoff_input_bounds(hour):
    assert client.get("/api/forecast", params={"day": "2026-01-10", "cutoff_hour": hour}).status_code == 422
    assert client.get("/api/accuracy", params={"cutoff_hour": hour}).status_code == 422
