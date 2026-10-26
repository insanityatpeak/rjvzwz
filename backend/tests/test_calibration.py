from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import analysis, elexon_client
from app.main import app

client = TestClient(app)


def sample_days(count):
    forecasts, actuals = [], []
    for offset in range(count):
        target = datetime(2026, 1, 1, 12, tzinfo=timezone.utc) + timedelta(days=offset)
        forecasts.append({"startTime": target.isoformat(),
                          "publishTime": (target - timedelta(hours=28)).isoformat(),
                          "generation": 100 + (offset + 1) * 10})
        for minutes in (0, 30):
            actuals.append({"startTime": (target + timedelta(minutes=minutes)).isoformat(), "generation": 100})
    return forecasts, actuals


@pytest.mark.parametrize("prior_days", [0, 2, 3, 5])
def test_prior_calibration_counts_matched_days_and_requires_three(monkeypatch, prior_days):
    forecasts, actuals = sample_days(prior_days + 2)
    monkeypatch.setattr(elexon_client, "fetch_forecasts", lambda s, e: forecasts)
    monkeypatch.setattr(elexon_client, "fetch_actuals", lambda s, e: actuals)
    day = date(2026, 1, 1) + timedelta(days=prior_days)
    response = client.get("/api/forecast", params={"day": day.isoformat(), "calibration": "prior"})
    assert response.status_code == 200
    body = response.json()
    assert body["calibration_days"] == prior_days
    assert body["calibration"] == "prior"
    assert body["day"] == day.isoformat()
    assert len(body["series"]) == 1
    if prior_days < 3:
        assert body["p90_abs_error"] is None
        assert "3" in body["calibration_note"]
    else:
        assert body["p90_abs_error"] == prior_days * 10
        assert body["calibration_note"] is None


def test_retrospective_default_uses_all_january_and_preserves_day_series(monkeypatch):
    forecasts, actuals = sample_days(7)
    monkeypatch.setattr(elexon_client, "fetch_forecasts", lambda s, e: forecasts)
    monkeypatch.setattr(elexon_client, "fetch_actuals", lambda s, e: actuals)
    default = client.get("/api/forecast", params={"day": "2026-01-03"}).json()
    explicit = client.get("/api/forecast", params={"day": "2026-01-03", "calibration": "retrospective"}).json()
    assert default == explicit
    assert default["calibration_days"] == 7
    assert default["p90_abs_error"] == 70
    assert default["series"] == analysis.accuracy(forecasts, actuals, date(2026, 1, 3), date(2026, 1, 3), 9)["series"]


def test_calibration_does_not_count_days_without_pairs(monkeypatch):
    forecasts, actuals = sample_days(5)
    actuals = actuals[:4]
    monkeypatch.setattr(elexon_client, "fetch_forecasts", lambda s, e: forecasts)
    monkeypatch.setattr(elexon_client, "fetch_actuals", lambda s, e: actuals)
    body = client.get("/api/forecast", params={"day": "2026-01-10", "calibration": "prior"}).json()
    assert body["calibration_days"] == 2
    assert body["p90_abs_error"] is None


def test_invalid_calibration_is_rejected_before_fetch(monkeypatch):
    def unexpected(*args):
        pytest.fail("Invalid calibration must not fetch Elexon")
    monkeypatch.setattr(elexon_client, "fetch_forecasts", unexpected)
    assert client.get("/api/forecast", params={"day": "2026-01-15", "calibration": "future"}).status_code == 422
