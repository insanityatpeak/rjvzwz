from datetime import date, datetime, timedelta, timezone

import pytest

from app import analysis as a


def forecast(target, published, generation=120):
    return {"startTime": target, "publishTime": published, "generation": generation}


def actual(target, generation=100):
    return {"startTime": target, "generation": generation}


def test_selection_ties_use_last_input_row():
    rows = [forecast("2026-01-10T12:00:00Z", "2026-01-09T08:30:00Z", value) for value in (200, 100)]
    selected = a.select_forecast(rows, date(2026, 1, 10), 9)
    assert selected[0]["forecast"] == 100
    assert selected[0]["forecast_age_hours"] == 0.5


@pytest.mark.parametrize("hour", [0, 9])
def test_exact_cutoff_and_year_boundary(hour):
    published = f"2025-12-31T{hour:02}:00:00Z"
    rows = [forecast("2026-01-01T00:00:00Z", published)]
    assert a.cutoff_utc(date(2026, 1, 1), hour) == datetime(2025, 12, 31, hour, tzinfo=timezone.utc)
    selected = a.select_forecast(rows, date(2026, 1, 1), hour)
    assert selected[0]["forecast_age_hours"] == 0
    result = a.accuracy(rows, [], date(2026, 1, 1), date(2026, 1, 1), hour)
    assert result["series"][0]["forecast_age_hours"] == 0


def test_actuals_deduplicate_before_averaging_and_report_completeness():
    rows = [actual("2026-01-10T12:00:00Z", 500), actual("2026-01-10T12:00:00Z", 100),
            actual("2026-01-10T12:30:00Z", 200), actual("2026-01-10T13:30:00Z", 80)]
    hourly, complete = a.hourly_actuals(rows, with_coverage=True)
    noon = a.parse_ts("2026-01-10T12:00:00Z")
    one = a.parse_ts("2026-01-10T13:00:00Z")
    assert hourly == {noon: 150, one: 80}
    assert complete == {noon}
    assert a.hourly_actuals(rows) == hourly


def test_accuracy_coverage_keeps_partial_and_missing_actuals():
    rows = [forecast(f"2026-01-10T{hour}:00:00Z", "2026-01-09T08:30:00Z") for hour in (12, 13, 14)]
    actuals = [actual("2026-01-10T12:00:00Z"), actual("2026-01-10T12:30:00Z"),
               actual("2026-01-10T13:30:00Z", 0)]
    result = a.accuracy(rows, actuals, date(2026, 1, 10), date(2026, 1, 10), 9)
    assert [p["actual"] for p in result["series"]] == [100, 0, None]
    assert [p["actual_complete"] for p in result["series"]] == [True, False, False]
    assert result["overall"]["n"] == 2
    assert result["overall"]["coverage"] == {
        "matched_hours": 2, "missing_actual_hours": 1, "incomplete_actual_hours": 1,
    }


def test_duplicate_half_hour_does_not_make_complete_hour():
    rows = [actual("2026-01-10T12:00:00Z", 100), actual("2026-01-10T12:00:00Z", 200)]
    hourly, complete = a.hourly_actuals(rows, with_coverage=True)
    assert list(hourly.values()) == [200]
    assert complete == set()


@pytest.mark.parametrize("n, expected", [(1, 1), (10, 9), (20, 18)])
def test_p90_uses_nearest_rank(n, expected):
    assert a.metrics([(100 + error, 100) for error in range(1, n + 1)])["p90_abs_error"] == expected


def test_metrics_report_mape_sample_count_wape_and_signed_split():
    result = a.metrics([(120, 100), (70, 100), (100, 100), (10, 0)])
    assert result["mape_n"] == 3
    assert result["mape"] == pytest.approx(50 / 3)
    assert result["wape"] == 20
    assert result["over_forecast_share"] == 0.5
    assert result["mean_over_error"] == 15
    assert result["mean_under_error"] == -30
    assert result["bias"] == 0
    assert result["mae"] == 15


@pytest.mark.parametrize("pairs, mape_n, wape, share, over, under", [
    ([], 0, None, None, None, None),
    ([(5, 0)], 0, None, 1, 5, None),
    ([(0, 5)], 1, 100, 0, None, -5),
    ([(5, 5)], 1, 0, 0, None, None),
])
def test_metrics_empty_zero_and_one_sided(pairs, mape_n, wape, share, over, under):
    result = a.metrics(pairs)
    assert (result["mape_n"], result["wape"], result["over_forecast_share"],
            result["mean_over_error"], result["mean_under_error"]) == (mape_n, wape, share, over, under)


def test_horizon_counts_distinct_hours_and_excludes_outside_leads():
    target = datetime(2026, 1, 10, 12, tzinfo=timezone.utc)
    rows = [forecast(target.isoformat(), (target - timedelta(hours=lead)).isoformat())
            for lead in (0, 5.5, 6, 47.5, 48, -1)]
    # Exclusions count in-range publications even when their target has no actual.
    rows.append(forecast("2026-01-10T13:00:00Z", "2026-01-08T13:00:00Z"))
    # Out-of-delivery-range publications do not affect any count.
    rows.append(forecast("2026-01-11T13:00:00Z", "2026-01-08T13:00:00Z"))
    result = a.accuracy(rows, [actual(target.isoformat())], date(2026, 1, 10), date(2026, 1, 10), 9)
    assert result["horizon_excluded"] == 3
    assert [(h["bucket"], h["n"], h["distinct_hours"], h["sparse"]) for h in result["horizon"]] == [
        ("0-6h", 2, 1, True), ("6-12h", 1, 1, True), ("42-48h", 1, 1, True),
    ]


def test_horizon_is_not_sparse_at_24_distinct_hours():
    targets = [datetime(2026, 1, 10, hour, tzinfo=timezone.utc) for hour in range(24)]
    rows = [forecast(t.isoformat(), (t - timedelta(hours=6)).isoformat()) for t in targets]
    result = a.accuracy(rows, [actual(t.isoformat()) for t in targets], date(2026, 1, 10), date(2026, 1, 10), 9)
    assert result["horizon"][0]["distinct_hours"] == 24
    assert result["horizon"][0]["sparse"] is False
