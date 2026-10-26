from datetime import date, datetime, timezone

from app import analysis as a


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


def test_cutoff_is_previous_day_london_time_winter():
    assert a.cutoff_utc(date(2026, 1, 10), 9) == utc(2026, 1, 9, 9)


def test_cutoff_respects_bst():
    assert a.cutoff_utc(date(2026, 7, 10), 9) == utc(2026, 7, 9, 8)


def test_select_forecast_takes_latest_publish_before_cutoff():
    rows = [
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-09T04:30:00Z", "generation": 100},
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-09T08:30:00Z", "generation": 200},
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-09T09:30:00Z", "generation": 300},
    ]
    out = a.select_forecast(rows, date(2026, 1, 10), 9)
    assert len(out) == 1
    assert out[0]["forecast"] == 200
    assert out[0]["publishTime"] == "2026-01-09T08:30:00Z"


def test_select_forecast_ignores_other_days():
    rows = [{"startTime": "2026-01-11T00:00:00Z", "publishTime": "2026-01-09T08:30:00Z", "generation": 1}]
    assert a.select_forecast(rows, date(2026, 1, 10), 9) == []


def test_hourly_actuals_averages_half_hours():
    rows = [
        {"startTime": "2026-01-10T12:00:00Z", "generation": 100},
        {"startTime": "2026-01-10T12:30:00Z", "generation": 200},
    ]
    assert a.hourly_actuals(rows) == {utc(2026, 1, 10, 12): 150.0}


def test_metrics():
    m = a.metrics([(110, 100), (90, 100), (130, 100)])
    assert m["n"] == 3
    assert m["mae"] == (10 + 10 + 30) / 3
    assert m["bias"] == (10 - 10 + 30) / 3
    assert round(m["rmse"], 6) == round(((100 + 100 + 900) / 3) ** 0.5, 6)
    assert round(m["mape"], 6) == round((10 + 10 + 30) / 3, 6)


def test_metrics_empty_and_zero_actual():
    assert a.metrics([])["n"] == 0
    assert a.metrics([(5, 0)])["mape"] is None


def test_accuracy_end_to_end():
    forecasts = [
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-09T08:30:00Z", "generation": 120},
    ]
    actuals = [
        {"startTime": "2026-01-10T12:00:00Z", "generation": 100},
        {"startTime": "2026-01-10T12:30:00Z", "generation": 100},
    ]
    res = a.accuracy(forecasts, actuals, date(2026, 1, 10), date(2026, 1, 10), 9)
    assert res["overall"]["mae"] == 20
    assert res["daily"][0]["day"] == "2026-01-10"
    assert res["series"][0]["lead_hours"] == 27.5
    assert res["horizon"][0]["bucket"] == "24-30h"
